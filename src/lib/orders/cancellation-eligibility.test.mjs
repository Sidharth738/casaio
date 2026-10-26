import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCustomerCancellationEligible } from './cancellation-eligibility.ts';

function order(overrides = {}) {
  return {
    orderStatus: 'pending',
    cancellationStatus: 'none',
    items: [{ fulfillmentStatus: 'pending' }],
    payment: { method: 'razorpay', status: 'captured', razorpayPaymentId: 'pay_synthetic' },
    ...overrides,
  };
}

test('allows pending or confirmed orders with captured Razorpay payment and pending fulfillment', () => {
  assert.equal(isCustomerCancellationEligible(order()), true);
  assert.equal(isCustomerCancellationEligible(order({ orderStatus: 'confirmed' })), true);
});

test('allows unpaid COD orders before fulfillment starts', () => {
  assert.equal(isCustomerCancellationEligible(order({
    payment: { method: 'cod', status: 'pending' },
  })), true);
});

test('does not allow Razorpay orders until capture identity is verified', () => {
  for (const payment of [
    { method: 'razorpay', status: 'pending', razorpayPaymentId: 'pay_synthetic' },
    { method: 'razorpay', status: 'authorized', razorpayPaymentId: 'pay_synthetic' },
    { method: 'razorpay', status: 'failed', razorpayPaymentId: 'pay_synthetic' },
    { method: 'razorpay', status: 'captured' },
    { method: 'razorpay', status: 'captured', razorpayPaymentId: 'pay_synthetic', reconciliationRequired: true },
  ]) {
    assert.equal(isCustomerCancellationEligible(order({ payment })), false);
  }
});

test('does not allow orders after shipment or while cancellation is processing or complete', () => {
  assert.equal(isCustomerCancellationEligible(order({ orderStatus: 'shipped' })), false);
  assert.equal(isCustomerCancellationEligible(order({ orderStatus: 'delivered' })), false);
  assert.equal(isCustomerCancellationEligible(order({ cancellationStatus: 'processing' })), false);
  assert.equal(isCustomerCancellationEligible(order({ cancellationStatus: 'completed' })), false);
  assert.equal(isCustomerCancellationEligible(order({ items: [{ fulfillmentStatus: 'shipped' }] })), false);
});
