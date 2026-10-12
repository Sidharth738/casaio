export function canRetryExistingOrder(
  providerOrder: { status: string; attempts: number },
  payments: Array<{ status: string }>
) {
  // A failed payment is not a provider finality signal: late authorization may
  // still arrive. Retry only before the order has had any payment attempt.
  return providerOrder.status === 'created' && providerOrder.attempts === 0 && payments.length === 0;
}

export function isCheckoutCoordinationFresh(
  createdAt: unknown,
  now = Date.now(),
  windowMs = 120_000,
  maxFutureSkewMs = 15_000
) {
  if (typeof createdAt !== 'string') return false;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  // A record from a slightly-ahead server clock (within maxFutureSkewMs) is fresh,
  // preventing duplicate orders due to inter-node timestamp drift.
  if (createdAtMs > now + maxFutureSkewMs) return false;
  return now - createdAtMs < windowMs;
}

export function getCaptureReconciliationReason(order: {
  payment?: { status?: string; failureFinalizedAt?: string; razorpayAuthorizedPaymentId?: string };
  orderStatus?: string;
  cancellationStatus?: string;
}, paymentId: string) {
  if (order.payment?.status === 'failed' || order.payment?.failureFinalizedAt) return 'late_capture_after_failure_finalization';
  if (order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed') return 'capture_after_order_cancellation';
  if (order.payment?.status === 'refunded' || order.payment?.status === 'refund_pending' || order.payment?.status === 'refund_failed') {
    return 'capture_after_refund_state';
  }
  if (order.payment?.razorpayAuthorizedPaymentId && order.payment.razorpayAuthorizedPaymentId !== paymentId) {
    return 'captured_payment_differs_from_authorized_payment';
  }
  return null;
}

export function isCapturedPaymentForOrder(
  payment: { id?: string; order_id?: string; amount?: number | string; currency?: string; status?: string },
  expected: { paymentId?: string; orderId: string; amount: number }
) {
  return Boolean(payment.id && payment.id === expected.paymentId &&
    payment.order_id === expected.orderId && Number(payment.amount) === expected.amount &&
    payment.currency === 'INR' && payment.status === 'captured');
}
