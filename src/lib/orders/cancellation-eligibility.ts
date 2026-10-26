interface CancellationEligibilityInput {
  orderStatus?: unknown;
  cancellationStatus?: unknown;
  items?: unknown;
  payment?: {
    method?: unknown;
    status?: unknown;
    razorpayPaymentId?: unknown;
    reconciliationRequired?: unknown;
  } | null;
}

/** UI visibility only; the authenticated cancellation route remains authoritative. */
export function isCustomerCancellationEligible(order: CancellationEligibilityInput | null | undefined) {
  if (!order || !['pending', 'confirmed'].includes(String(order.orderStatus))) return false;
  if (order.cancellationStatus === 'processing' || order.cancellationStatus === 'completed') return false;
  if (!Array.isArray(order.items) || order.items.length === 0 ||
      order.items.some((item) => !item || typeof item !== 'object' || item.fulfillmentStatus !== 'pending')) {
    return false;
  }

  const payment = order.payment;
  if (payment?.method === 'cod') return payment.status === 'pending';

  return payment?.method === 'razorpay' &&
    payment.status === 'captured' &&
    typeof payment.razorpayPaymentId === 'string' &&
    payment.razorpayPaymentId.length > 0 &&
    payment.reconciliationRequired !== true;
}
