import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeCouponReconciliation } from './reconciliation.mjs';

const coupon = (overrides = {}) => ({
  id: 'coupon-synthetic-1',
  code: 'SAVE10',
  usageLimit: 10,
  usageCount: 1,
  perUserLimit: 1,
  discountType: 'percentage',
  discountValue: 10,
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2026-12-31T23:59:59Z',
  isActive: true,
  ...overrides,
});

const order = (overrides = {}) => ({
  id: 'order-synthetic-1',
  customerRef: 'p_0123456789abcdef0123456789abcdef',
  createdAt: '2026-04-01T12:00:00Z',
  couponApplied: { couponId: 'coupon-synthetic-1', code: 'SAVE10', discountAmount: 50 },
  pricing: { totalAmount: 450 },
  payment: { method: 'razorpay', status: 'captured', paymentId: 'payment-synthetic-1' },
  orderStatus: 'delivered',
  cancellationStatus: 'none',
  ...overrides,
});

const analyze = (orders, coupons = [coupon()]) => analyzeCouponReconciliation({ schemaVersion: 1, coupons, orders });

test('captured payment with no refund counts as consumed', () => {
  const result = analyze([order()]);
  assert.equal(result.orders[0].classification, 'consumed');
  assert.ok(result.orders[0].reasonCodes.includes('CAPTURED_PAYMENT_COUNTS_AS_USE'));
});

test('confirmed full refund with matching IDs, amount, and currency is release-review only', () => {
  const result = analyze([order({
    payment: { method: 'razorpay', status: 'captured', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
    refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 45000, currency: 'INR' }],
  })]);
  assert.equal(result.orders[0].classification, 'eligible_for_release_review');
  assert.equal(result.summary.noCountersChanged, true);
});

test('full refund with mismatched payment ID, amount, or currency cannot release usage', () => {
  for (const refund of [
    { id: 'refund-synthetic-1', orderId: 'other-order', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 45000, currency: 'INR' },
    { id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'other-payment', status: 'processed', amountPaise: 45000, currency: 'INR' },
    { id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 44999, currency: 'INR' },
    { id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 45000, currency: 'USD' },
  ]) {
    const result = analyze([order({
      payment: { method: 'razorpay', status: 'refunded', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
      refunds: [refund],
    })]);
    assert.equal(result.orders[0].classification, 'ambiguous');
  }
});

test('partial refund does not release the full coupon use', () => {
  const result = analyze([order({
    payment: { method: 'razorpay', status: 'captured', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
    refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 1000, currency: 'INR' }],
  })]);
  assert.equal(result.orders[0].classification, 'consumed');
  assert.ok(result.orders[0].reasonCodes.includes('PARTIAL_REFUND_DOES_NOT_RELEASE_USE'));
});

test('pending refund remains reserved', () => {
  const result = analyze([order({
    payment: { method: 'razorpay', status: 'refund_pending', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
    refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'pending', amountPaise: 45000, currency: 'INR' }],
  })]);
  assert.equal(result.orders[0].classification, 'reserved');
});

test('failed refund with uncertain payment finality remains ambiguous', () => {
  const result = analyze([order({
    payment: { method: 'razorpay', status: 'refund_failed', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
    refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'failed', amountPaise: 45000, currency: 'INR' }],
  })]);
  assert.equal(result.orders[0].classification, 'ambiguous');
  assert.ok(result.orders[0].reasonCodes.includes('REFUND_FAILURE_REQUIRES_REVIEW'));
});

test('failure event remains reserved while late capture is possible', () => {
  const result = analyze([order({ payment: { method: 'razorpay', status: 'failed', paymentId: 'payment-synthetic-1' } })]);
  assert.equal(result.orders[0].classification, 'reserved');
  assert.ok(result.orders[0].reasonCodes.includes('FAILURE_NOT_FINAL_LATE_CAPTURE_POSSIBLE'));
});

test('later captured state after a failure is counted as consumed', () => {
  const failed = order({ payment: { method: 'razorpay', status: 'failed', paymentId: 'payment-synthetic-1' } });
  const capturedLater = { ...failed, payment: { method: 'razorpay', status: 'captured', paymentId: 'payment-synthetic-1' } };
  assert.equal(analyze([failed]).orders[0].classification, 'reserved');
  assert.equal(analyze([capturedLater]).orders[0].classification, 'consumed');
});

test('COD with explicit collection evidence counts as consumed', () => {
  const result = analyze([order({
    payment: { method: 'cod', status: 'pending' },
    codCollection: { status: 'collected', collectedAt: '2026-04-02T12:00:00Z', evidenceId: 'receipt-synthetic-1' },
  })]);
  assert.equal(result.orders[0].classification, 'consumed');
});

test('delivered COD without collection evidence is ambiguous', () => {
  const result = analyze([order({ payment: { method: 'cod', status: 'pending' } })]);
  assert.equal(result.orders[0].classification, 'ambiguous');
  assert.ok(result.orders[0].reasonCodes.includes('COD_DELIVERED_WITHOUT_COLLECTION_EVIDENCE'));
});

test('missing coupon identity and reused code are ambiguous', () => {
  const missing = analyze([order({ couponApplied: { code: 'NO-SUCH-CODE', discountAmount: 50 } })]);
  assert.equal(missing.orders[0].classification, 'ambiguous');
  const missingDocumentId = analyze([order({ couponApplied: { code: 'SAVE10', discountAmount: 50 } })]);
  assert.equal(missingDocumentId.orders[0].classification, 'ambiguous');
  assert.ok(missingDocumentId.orders[0].reasonCodes.includes('ORDER_COUPON_DOCUMENT_ID_MISSING'));
  const reused = analyze([order({ couponApplied: { code: 'SAVE10', discountAmount: 50 } })], [coupon(), coupon({ id: 'coupon-synthetic-2' })]);
  assert.equal(reused.orders[0].classification, 'ambiguous');
  assert.ok(reused.orders[0].reasonCodes.includes('COUPON_CODE_REUSED_OR_AMBIGUOUS'));
  const unknownId = analyze([order({ couponApplied: { couponId: 'unknown-coupon', code: 'SAVE10', discountAmount: 50 } })]);
  assert.equal(unknownId.orders[0].classification, 'ambiguous');
});

test('historical order missing payment fields is ambiguous', () => {
  const result = analyze([order({ payment: undefined })]);
  assert.equal(result.orders[0].classification, 'ambiguous');
  assert.ok(result.orders[0].reasonCodes.includes('PAYMENT_FIELDS_MISSING'));
});

test('candidate customer uses flag possible per-user limit exceedance', () => {
  const result = analyze([
    order({ id: 'order-synthetic-1' }),
    order({ id: 'order-synthetic-2', customerRef: 'p_0123456789abcdef0123456789abcdef' }),
  ]);
  assert.deepEqual(result.coupons[0].possiblePerUserLimitExceedances, ['p_0123456789abcdef0123456789abcdef']);
  assert.equal(result.coupons[0].customerCounts[0].totalCandidateUses, 2);
});

test('missing or malformed customer references stay ambiguous and are not echoed', () => {
  for (const customerRef of [undefined, 'customer-real-uid-synthetic', 'person@example.test']) {
    const result = analyze([order({ customerRef, customerId: 'raw-customer-id-synthetic' })]);
    assert.equal(result.orders[0].classification, 'ambiguous');
    assert.equal(result.orders[0].customerRef, null);
    assert.equal('customerId' in result.orders[0], false);
    assert.doesNotMatch(JSON.stringify(result), /person@example\.test|raw-customer-id-synthetic/);
  }
});

test('counter difference is diagnostic and is never asserted as a proven error', () => {
  const result = analyze([order()], [coupon({ usageCount: 9 })]);
  assert.equal(result.coupons[0].diagnosticCounterDifference, 8);
  assert.equal(result.coupons[0].counterDifferenceIsProvenError, false);
  assert.equal(result.coupons[0].minimumClearlyEvidencedHistoricalUses, 1);
});

test('missing, malformed, negative, and inconsistent usage counters are reported as configuration issues', () => {
  for (const overrides of [
    { usageCount: undefined },
    { usageCount: 'one' },
    { usageCount: -1 },
    { usageCount: 11 },
    { usageLimit: -1 },
  ]) {
    const result = analyze([order()], [coupon(overrides)]);
    assert.equal(result.orders[0].classification, 'ambiguous');
    assert.ok(result.coupons[0].configurationIssues.length > 0);
    assert.equal(result.coupons[0].counterDifferenceIsProvenError, false);
  }
});

test('malformed coupon records without usable identifiers are not silently omitted', () => {
  const result = analyze([], [null, coupon({ id: '', code: '' })]);
  assert.equal(result.summary.malformedCouponRecords, 2);
  assert.equal(result.couponInputIssues.length, 2);
  assert.ok(result.couponInputIssues.every((issue) => issue.reasonCodes.length > 0));
});

test('contradictory refunded status without matching full refund remains ambiguous', () => {
  const result = analyze([order({
    payment: { method: 'razorpay', status: 'refunded', paymentId: 'payment-synthetic-1', refundId: 'refund-synthetic-1' },
    refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'failed', amountPaise: 45000, currency: 'INR' }],
  })]);
  assert.equal(result.orders[0].classification, 'ambiguous');
});

test('duplicate order IDs are ambiguous and excluded from candidate counts', () => {
  const result = analyze([order(), order()]);
  assert.equal(result.summary.countsByClassification.ambiguous, 2);
  assert.equal(result.coupons[0].matchedNonAmbiguousOrderCount, 0);
  assert.equal(result.summary.ordersWithDuplicateIds, 2);
});

test('invalid top-level input is rejected and malformed amounts become ambiguous', () => {
  assert.throws(() => analyzeCouponReconciliation({ schemaVersion: 2, coupons: [], orders: [] }), /schemaVersion 1/);
  assert.throws(() => analyzeCouponReconciliation({ schemaVersion: 1, coupons: {}, orders: [] }), /schemaVersion 1/);
  const empty = analyzeCouponReconciliation({ schemaVersion: 1, coupons: [], orders: [] });
  assert.equal(empty.summary.ordersScanned, 0);
  assert.equal(empty.summary.countsByClassification.ambiguous, 0);
  const result = analyze([order({ pricing: { totalAmount: Number.NaN } })]);
  assert.equal(result.orders[0].classification, 'ambiguous');
  assert.ok(result.orders[0].reasonCodes.includes('PAYABLE_TOTAL_INVALID'));
  const unsafeAmount = analyze([order({ pricing: { totalAmount: Number.MAX_VALUE } })]);
  assert.equal(unsafeAmount.orders[0].classification, 'ambiguous');
});

test('analysis does not mutate input or nested records and produces deterministic output', () => {
  const input = {
    schemaVersion: 1,
    coupons: [coupon()],
    orders: [order({ refunds: [{ id: 'refund-synthetic-1', orderId: 'order-synthetic-1', paymentId: 'payment-synthetic-1', status: 'processed', amountPaise: 1000, currency: 'INR' }] })],
  };
  const snapshot = JSON.stringify(input);
  const freeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  freeze(input);
  const first = analyzeCouponReconciliation(input);
  const second = analyzeCouponReconciliation(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(first, second);
});

test('analyzer module has no network, environment, filesystem, or Firebase write path', async () => {
  const source = await readFile(new URL('./reconciliation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()\s*['"](?:node:)?(?:fs|https?|net|tls|dns|child_process|firebase[^'"]*)/i);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|process\.env|adminDb|writeFile|updateDoc|setDoc|transaction\.update)\b/);
});
