export type PaymentConfirmationState =
  | 'confirmed'
  | 'pending'
  | 'reconciliation_required'
  | 'failed'
  | 'cancelled';

interface PersistedOrderPaymentState {
  orderStatus?: string;
  cancellationStatus?: string;
  payment?: {
    method?: string;
    status?: string;
    reconciliationRequired?: boolean;
  };
}

/** Classifies only persisted order state; a provider callback alone is not confirmation. */
export function getPaymentConfirmationState(order: PersistedOrderPaymentState): PaymentConfirmationState {
  const payment = order.payment;
  if ((order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed') && payment?.status === 'captured') {
    return 'reconciliation_required';
  }
  if (order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed') return 'cancelled';

  if (payment?.reconciliationRequired || payment?.status === 'refund_pending' ||
      payment?.status === 'refund_failed' || payment?.status === 'refunded') {
    return 'reconciliation_required';
  }

  if (payment?.method === 'cod') {
    return order.orderStatus && order.orderStatus !== 'pending' ? 'confirmed' : 'pending';
  }

  if (payment?.status === 'failed') return 'failed';
  if (payment?.status !== 'captured') return 'pending';

  // Captured payment with an order that was not advanced is an inconsistency, not
  // proof that normal fulfillment confirmation completed.
  return order.orderStatus && order.orderStatus !== 'pending'
    ? 'confirmed'
    : 'reconciliation_required';
}
