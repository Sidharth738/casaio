import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidFulfillmentTransition,
  computeOverallOrderStatus,
  validatePaymentForFulfillment,
} from './fulfillment-validation.ts';

test('allows re-saving the identical status (e.g. updating tracking info)', () => {
  assert.equal(isValidFulfillmentTransition('pending', 'pending').valid, true);
  assert.equal(isValidFulfillmentTransition('processing', 'processing').valid, true);
  assert.equal(isValidFulfillmentTransition('shipped', 'shipped').valid, true);
  assert.equal(isValidFulfillmentTransition('out_for_delivery', 'out_for_delivery').valid, true);
});

test('allows forward status progression', () => {
  assert.equal(isValidFulfillmentTransition('pending', 'processing').valid, true);
  assert.equal(isValidFulfillmentTransition('pending', 'shipped').valid, true);
  assert.equal(isValidFulfillmentTransition('processing', 'shipped').valid, true);
  assert.equal(isValidFulfillmentTransition('shipped', 'out_for_delivery').valid, true);
  assert.equal(isValidFulfillmentTransition('shipped', 'delivered').valid, true);
  assert.equal(isValidFulfillmentTransition('out_for_delivery', 'delivered').valid, true);
});

test('allows cancellation before dispatch', () => {
  assert.equal(isValidFulfillmentTransition('pending', 'cancelled').valid, true);
  assert.equal(isValidFulfillmentTransition('processing', 'cancelled').valid, true);
});

test('rejects regressive status transitions', () => {
  const shippedToProcessing = isValidFulfillmentTransition('shipped', 'processing');
  assert.equal(shippedToProcessing.valid, false);
  assert.match(shippedToProcessing.reason, /Cannot transition/);

  const shippedToPending = isValidFulfillmentTransition('shipped', 'pending');
  assert.equal(shippedToPending.valid, false);

  const deliveredToShipped = isValidFulfillmentTransition('delivered', 'shipped');
  assert.equal(deliveredToShipped.valid, false);
  assert.match(deliveredToShipped.reason, /already delivered/);

  const deliveredToPending = isValidFulfillmentTransition('delivered', 'pending');
  assert.equal(deliveredToPending.valid, false);
});

test('rejects modifying a cancelled item', () => {
  const cancelledToShipped = isValidFulfillmentTransition('cancelled', 'shipped');
  assert.equal(cancelledToShipped.valid, false);
  assert.match(cancelledToShipped.reason, /cancelled item/);

  const cancelledToProcessing = isValidFulfillmentTransition('cancelled', 'processing');
  assert.equal(cancelledToProcessing.valid, false);
});

test('rejects cancelling a shipped or out_for_delivery item directly from fulfillment', () => {
  const shippedToCancelled = isValidFulfillmentTransition('shipped', 'cancelled');
  assert.equal(shippedToCancelled.valid, false);

  const outForDeliveryToCancelled = isValidFulfillmentTransition('out_for_delivery', 'cancelled');
  assert.equal(outForDeliveryToCancelled.valid, false);
});

test('computes overall order status across multi-vendor items', () => {
  // Two vendors: Vendor A shipped, Vendor B pending -> overall remains pending/processing
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'shipped' }, { fulfillmentStatus: 'pending' }],
      'pending'
    ),
    'processing'
  );

  // Both vendors shipped -> overall is shipped
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'shipped' }, { fulfillmentStatus: 'shipped' }],
      'processing'
    ),
    'shipped'
  );

  // One shipped, one delivered -> overall is shipped
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'shipped' }, { fulfillmentStatus: 'delivered' }],
      'shipped'
    ),
    'shipped'
  );

  // Both delivered -> overall is delivered
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'delivered' }, { fulfillmentStatus: 'delivered' }],
      'shipped'
    ),
    'delivered'
  );

  // Vendor A delivered, Vendor B cancelled -> remaining active item delivered -> delivered
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'delivered' }, { fulfillmentStatus: 'cancelled' }],
      'shipped'
    ),
    'delivered'
  );

  // All items cancelled -> overall is cancelled
  assert.equal(
    computeOverallOrderStatus(
      [{ fulfillmentStatus: 'cancelled' }, { fulfillmentStatus: 'cancelled' }],
      'pending'
    ),
    'cancelled'
  );
});

test('validatePaymentForFulfillment permits shipping and delivery for captured online orders', () => {
  const capturedPayment = { method: 'razorpay', status: 'captured' };
  assert.equal(validatePaymentForFulfillment(capturedPayment, 'shipped').allowed, true);
  assert.equal(validatePaymentForFulfillment(capturedPayment, 'out_for_delivery').allowed, true);
  assert.equal(validatePaymentForFulfillment(capturedPayment, 'delivered').allowed, true);
});

test('validatePaymentForFulfillment blocks shipping and delivery for unpaid/pending online orders', () => {
  const pendingPayment = { method: 'razorpay', status: 'pending' };

  // Dispatch transitions blocked
  const shipCheck = validatePaymentForFulfillment(pendingPayment, 'shipped');
  assert.equal(shipCheck.allowed, false);
  assert.match(shipCheck.reason, /Payment must be captured first/);

  const outCheck = validatePaymentForFulfillment(pendingPayment, 'out_for_delivery');
  assert.equal(outCheck.allowed, false);

  const deliverCheck = validatePaymentForFulfillment(pendingPayment, 'delivered');
  assert.equal(deliverCheck.allowed, false);

  // Non-dispatch milestones permitted
  assert.equal(validatePaymentForFulfillment(pendingPayment, 'processing').allowed, true);
  assert.equal(validatePaymentForFulfillment(pendingPayment, 'cancelled').allowed, true);
});

test('validatePaymentForFulfillment blocks shipping and delivery for failed or missing online payment', () => {
  const failedPayment = { method: 'razorpay', status: 'failed' };
  assert.equal(validatePaymentForFulfillment(failedPayment, 'shipped').allowed, false);
  assert.equal(validatePaymentForFulfillment(failedPayment, 'delivered').allowed, false);

  // Missing or undefined payment
  assert.equal(validatePaymentForFulfillment(undefined, 'shipped').allowed, false);
  assert.equal(validatePaymentForFulfillment({}, 'shipped').allowed, false);
  assert.equal(validatePaymentForFulfillment({ status: 'captured' }, 'shipped').allowed, false);
});

test('validatePaymentForFulfillment strictly rejects unknown or malformed payment methods for dispatch', () => {
  // Unknown methods
  const stripePayment = { method: 'stripe', status: 'captured' };
  const stripeCheck = validatePaymentForFulfillment(stripePayment, 'shipped');
  assert.equal(stripeCheck.allowed, false);
  assert.match(stripeCheck.reason, /Unsupported payment method "stripe"/);

  const cryptoPayment = { method: 'crypto', status: 'captured' };
  assert.equal(validatePaymentForFulfillment(cryptoPayment, 'delivered').allowed, false);

  // Malformed methods
  assert.equal(validatePaymentForFulfillment({ method: '   ', status: 'captured' }, 'shipped').allowed, false);
  assert.equal(validatePaymentForFulfillment({ method: 12345, status: 'captured' }, 'shipped').allowed, false);
  assert.equal(validatePaymentForFulfillment({ method: null, status: 'captured' }, 'shipped').allowed, false);

  // Non-dispatch milestones still allowed for unknown/malformed methods
  assert.equal(validatePaymentForFulfillment(stripePayment, 'processing').allowed, true);
  assert.equal(validatePaymentForFulfillment(stripePayment, 'cancelled').allowed, true);
});

test('validatePaymentForFulfillment preserves legitimate COD fulfillment while payment is pending, but rejects failed COD', () => {
  const pendingCod = { method: 'cod', status: 'pending' };
  assert.equal(validatePaymentForFulfillment(pendingCod, 'shipped').allowed, true);
  assert.equal(validatePaymentForFulfillment(pendingCod, 'out_for_delivery').allowed, true);
  assert.equal(validatePaymentForFulfillment(pendingCod, 'delivered').allowed, true);

  // Failed or cancelled COD orders cannot be dispatched
  const failedCod = { method: 'cod', status: 'failed' };
  const failedCheck = validatePaymentForFulfillment(failedCod, 'shipped');
  assert.equal(failedCheck.allowed, false);
  assert.match(failedCheck.reason, /Cannot ship or deliver a COD order with payment status "failed"/);

  const cancelledCod = { method: 'cod', status: 'cancelled' };
  assert.equal(validatePaymentForFulfillment(cancelledCod, 'delivered').allowed, false);
});


