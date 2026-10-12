import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryExistingOrder,
  getCaptureReconciliationReason,
  isCapturedPaymentForOrder,
  isCheckoutCoordinationFresh,
} from './attempt-state.ts';

test('same Razorpay order is retryable only before any payment attempt exists', () => {
  assert.equal(canRetryExistingOrder({ status: 'created', attempts: 0 }, []), true);
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 1 }, [{ status: 'failed' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 2 }, [{ status: 'failed' }, { status: 'failed' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 1 }, [{ status: 'authorized' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'paid', attempts: 1 }, [{ status: 'captured' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'created', attempts: 0 }, [{ status: 'created' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 1 }, [{ status: 'created' }]), false);
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 1 }, []), false);
});

test('checkout deduplication window accepts only recent server timestamps', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  assert.equal(isCheckoutCoordinationFresh('2026-10-11T11:59:00.000Z', now), true);
  assert.equal(isCheckoutCoordinationFresh('2026-10-11T11:50:00.000Z', now), false);
  assert.equal(isCheckoutCoordinationFresh('2026-10-11T12:01:00.000Z', now), false);
  assert.equal(isCheckoutCoordinationFresh('invalid', now), false);
});

test('late, cancelled, refunded, or mismatched captures require reconciliation', () => {
  assert.equal(getCaptureReconciliationReason({ payment: { status: 'failed', failureFinalizedAt: '2026-10-01' } }, 'pay_1'), 'late_capture_after_failure_finalization');
  assert.equal(getCaptureReconciliationReason({ orderStatus: 'cancelled', payment: { status: 'pending' } }, 'pay_1'), 'capture_after_order_cancellation');
  assert.equal(getCaptureReconciliationReason({ payment: { status: 'refund_pending' } }, 'pay_1'), 'capture_after_refund_state');
  assert.equal(getCaptureReconciliationReason({ payment: { status: 'authorized', razorpayAuthorizedPaymentId: 'pay_1' } }, 'pay_2'), 'captured_payment_differs_from_authorized_payment');
  assert.equal(getCaptureReconciliationReason({ payment: { status: 'authorized', razorpayAuthorizedPaymentId: 'pay_1' } }, 'pay_1'), null);
});

test('captured payment must match the existing payment and order identity, amount, currency, and status', () => {
  const payment = { id: 'pay_1', order_id: 'order_1', amount: 500, currency: 'INR', status: 'captured' };
  const expected = { paymentId: 'pay_1', orderId: 'order_1', amount: 500 };
  assert.equal(isCapturedPaymentForOrder(payment, expected), true);
  assert.equal(isCapturedPaymentForOrder(payment, { ...expected, paymentId: 'pay_other' }), false);
  assert.equal(isCapturedPaymentForOrder(payment, { ...expected, orderId: 'order_other' }), false);
  assert.equal(isCapturedPaymentForOrder(payment, { ...expected, amount: 501 }), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, currency: 'USD' }, expected), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, status: 'authorized' }, expected), false);
});

test('isCheckoutCoordinationFresh: clock-skew tolerance within maxFutureSkewMs=15s is accepted', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  // A record written by a node whose clock is 10 s ahead — should be treated as fresh.
  const tenSecondsFuture = new Date(now + 10_000).toISOString();
  assert.equal(isCheckoutCoordinationFresh(tenSecondsFuture, now), true, '10s future within skew window should be fresh');

  // A record from a node 20 s ahead — exceeds maxFutureSkewMs=15s, must be rejected.
  const twentySecondsFuture = new Date(now + 20_000).toISOString();
  assert.equal(isCheckoutCoordinationFresh(twentySecondsFuture, now), false, '20s future outside skew window should not be fresh');

  // Record exactly at the maxFutureSkewMs boundary (15 s ahead) — borderline: > check is strict so 15000 === 15000 is NOT > maxFutureSkewMs, still fresh.
  const exactSkewBoundary = new Date(now + 15_000).toISOString();
  assert.equal(isCheckoutCoordinationFresh(exactSkewBoundary, now), true, 'Exactly 15s future (not strictly greater) should be fresh');

  // Record 15 001 ms ahead — just over the boundary, must be rejected.
  const justOverSkew = new Date(now + 15_001).toISOString();
  assert.equal(isCheckoutCoordinationFresh(justOverSkew, now), false, '15001ms future should be rejected');
});

test('isCheckoutCoordinationFresh: 2-minute window boundary is exact', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z');
  // 119 900 ms ago — still inside the 120 000 ms window.
  const justInsideWindow = new Date(now - 119_900).toISOString();
  assert.equal(isCheckoutCoordinationFresh(justInsideWindow, now), true, '119.9s old should be fresh');

  // Exactly 120 000 ms ago — `now - createdAtMs < windowMs` is `120000 < 120000` → false.
  const exactBoundary = new Date(now - 120_000).toISOString();
  assert.equal(isCheckoutCoordinationFresh(exactBoundary, now), false, 'Exactly 120s old should be stale');

  // 120 100 ms ago — clearly outside the window.
  const justOutsideWindow = new Date(now - 120_100).toISOString();
  assert.equal(isCheckoutCoordinationFresh(justOutsideWindow, now), false, '120.1s old should be stale');
});

test('canRetryExistingOrder: only an untouched created order with zero payments is retryable', () => {
  // The one safe case: Razorpay order just created, no payment attempts yet.
  assert.equal(canRetryExistingOrder({ status: 'created', attempts: 0 }, []), true);

  // Any non-zero attempts count blocks retry regardless of status.
  assert.equal(canRetryExistingOrder({ status: 'created', attempts: 1 }, []), false, 'attempts=1 should block retry');

  // Payments list non-empty blocks retry even if attempts counter is somehow 0.
  assert.equal(canRetryExistingOrder({ status: 'created', attempts: 0 }, [{ status: 'failed' }]), false, 'stale failed payment should block retry');

  // Status other than 'created' always blocks retry.
  assert.equal(canRetryExistingOrder({ status: 'attempted', attempts: 0 }, []), false, "'attempted' status blocks retry");
  assert.equal(canRetryExistingOrder({ status: 'paid', attempts: 0 }, []), false, "'paid' status blocks retry");
  assert.equal(canRetryExistingOrder({ status: 'expired', attempts: 0 }, []), false, "'expired' status blocks retry");
});

