import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReconciliationRequest,
  describeLoadFailure,
  describeReconciliationResponse,
  formatAttemptAge,
  formatRefundAmount,
  refundDiagnosticLabel,
} from './refund-reconciliation-ui.ts';

test('refund reconciliation list formatting is safe and handles malformed data', () => {
  assert.equal(formatRefundAmount(12500, 'INR'), '₹125.00');
  assert.equal(formatRefundAmount(Number.MAX_SAFE_INTEGER + 1, 'INR'), 'Amount unavailable');
  assert.equal(formatAttemptAge('2026-10-25T00:00:00.000Z', Date.parse('2026-10-25T02:03:00.000Z')), '2h');
  assert.equal(formatAttemptAge('invalid'), 'Age unavailable');
  assert.equal(refundDiagnosticLabel('provider_evidence_mismatch'), 'Provider evidence mismatch');
  assert.equal(refundDiagnosticLabel('customer-entered-secret'), 'Manual review required');
});

test('reconciliation request uses the API contract and explicit idempotency key', () => {
  const request = buildReconciliationRequest('order_synthetic', 'attempt_synthetic', 'admin_reconcile_12345678');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Idempotency-Key'], 'admin_reconcile_12345678');
  assert.deepEqual(JSON.parse(request.body), { orderId: 'order_synthetic', attemptId: 'attempt_synthetic' });
});

test('verified provider outcomes remain distinct from unknown and mismatched results', () => {
  assert.equal(describeReconciliationResponse(200, { status: 'processed' }).kind, 'verified');
  assert.equal(describeReconciliationResponse(200, { status: 'pending' }).title, 'Refund pending');
  assert.equal(describeReconciliationResponse(200, { status: 'failed' }).title, 'Refund failed');
  assert.equal(describeReconciliationResponse(200, { status: 'reconciliation_required' }).kind, 'manual_review');
  assert.equal(describeReconciliationResponse(409, { status: 'unknown' }).kind, 'manual_review');
  assert.equal(describeReconciliationResponse(409, { status: 'unknown', message: 'Provider evidence does not match this refund attempt.' }).title, 'Provider evidence mismatch');
  assert.equal(describeReconciliationResponse(503, { status: 'unknown' }).kind, 'unknown');
  assert.equal(describeReconciliationResponse(403, {}).kind, 'access');
  assert.equal(describeLoadFailure(404).title, 'Case data is stale');
  assert.equal(describeLoadFailure(500).kind, 'error');
});
