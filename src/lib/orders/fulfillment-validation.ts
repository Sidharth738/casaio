import type { FulfillmentStatus, OrderStatus } from '@/types';

export const VALID_FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  'pending',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

/**
 * Validates whether a requested fulfillment status transition is allowable.
 * Prevents backwards status regression and modifications to final states.
 */
export function isValidFulfillmentTransition(
  currentStatus: FulfillmentStatus,
  nextStatus: FulfillmentStatus
): { valid: boolean; reason?: string } {
  if (currentStatus === nextStatus) {
    return { valid: true };
  }

  if (currentStatus === 'delivered') {
    return {
      valid: false,
      reason: 'Cannot change fulfillment status of an already delivered item',
    };
  }

  if (currentStatus === 'cancelled') {
    return {
      valid: false,
      reason: 'Cannot change fulfillment status of a cancelled item',
    };
  }

  switch (currentStatus) {
    case 'pending':
      if (['processing', 'shipped', 'cancelled'].includes(nextStatus)) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cannot transition directly from "${currentStatus}" to "${nextStatus}". Please mark as processing or shipped first.`,
      };

    case 'processing':
      if (['shipped', 'cancelled'].includes(nextStatus)) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cannot transition from "${currentStatus}" to "${nextStatus}". Allowed transitions: shipped or cancelled.`,
      };

    case 'shipped':
      if (['out_for_delivery', 'delivered'].includes(nextStatus)) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cannot transition from "${currentStatus}" to "${nextStatus}". A shipped item cannot be cancelled or regressed.`,
      };

    case 'out_for_delivery':
      if (nextStatus === 'delivered') {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cannot transition from "${currentStatus}" to "${nextStatus}". Allowed transition: delivered.`,
      };

    default:
      return { valid: false, reason: `Unknown current status "${currentStatus}"` };
  }
}

/**
 * Computes the aggregate order status derived from all line items across multiple vendors.
 */
export function computeOverallOrderStatus(
  items: Array<{ fulfillmentStatus: FulfillmentStatus }>,
  currentOrderStatus: OrderStatus
): OrderStatus {
  if (!items || items.length === 0) {
    return currentOrderStatus;
  }

  // If order is already in a final cancelled state, preserve it
  if (currentOrderStatus === 'cancelled') {
    return 'cancelled';
  }

  const allItemsCancelled = items.every((i) => i.fulfillmentStatus === 'cancelled');
  if (allItemsCancelled) {
    return 'cancelled';
  }

  const activeItems = items.filter((i) => i.fulfillmentStatus !== 'cancelled');
  if (activeItems.length === 0) {
    return 'cancelled';
  }

  const allActiveDelivered = activeItems.every((i) => i.fulfillmentStatus === 'delivered');
  if (allActiveDelivered) {
    return 'delivered';
  }

  const allActiveDispatched = activeItems.every(
    (i) =>
      i.fulfillmentStatus === 'shipped' ||
      i.fulfillmentStatus === 'out_for_delivery' ||
      i.fulfillmentStatus === 'delivered'
  );
  if (allActiveDispatched) {
    return 'shipped';
  }

  const anyActiveProcessingOrBeyond = activeItems.some(
    (i) => i.fulfillmentStatus !== 'pending'
  );
  if (anyActiveProcessingOrBeyond && currentOrderStatus === 'pending') {
    return 'processing';
  }

  return currentOrderStatus;
}

export const SUPPORTED_PAYMENT_METHODS = ['cod', 'razorpay'] as const;
export type SupportedPaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];

/**
 * Verifies whether the order's payment state permits the requested fulfillment transition.
 *
 * Rules:
 * - Non-dispatch milestones ('processing', 'cancelled') do not require captured payment.
 * - Only explicitly supported payment methods ('cod' and 'razorpay') are permitted for dispatch.
 * - Unknown, missing, or malformed payment methods are strictly rejected for dispatch.
 * - Legitimate COD orders can be dispatched ('shipped', 'out_for_delivery', 'delivered') while payment is pending.
 * - Online orders ('razorpay') must have payment.status === 'captured' to be dispatched. Unpaid, pending,
 *   failed, or missing payment states are rejected.
 */
export function validatePaymentForFulfillment(
  payment: { method?: string; status?: string } | undefined,
  targetFulfillmentStatus: FulfillmentStatus
): { allowed: boolean; reason?: string } {
  const isDispatchTransition = ['shipped', 'out_for_delivery', 'delivered'].includes(targetFulfillmentStatus);
  if (!isDispatchTransition) {
    return { allowed: true };
  }

  if (!payment || typeof payment.method !== 'string' || !payment.method.trim()) {
    return {
      allowed: false,
      reason: 'Cannot ship or deliver an order without verified payment details.',
    };
  }

  const normalizedMethod = payment.method.toLowerCase().trim();
  if (!SUPPORTED_PAYMENT_METHODS.includes(normalizedMethod as SupportedPaymentMethod)) {
    return {
      allowed: false,
      reason: `Unsupported payment method "${payment.method}". Only "cod" and "razorpay" are recognized.`,
    };
  }

  if (normalizedMethod === 'razorpay') {
    if (payment.status !== 'captured') {
      return {
        allowed: false,
        reason: `Cannot ship or deliver an online order with payment status "${payment.status || 'unpaid'}". Payment must be captured first.`,
      };
    }
  }

  if (normalizedMethod === 'cod') {
    if (payment.status === 'failed' || payment.status === 'cancelled') {
      return {
        allowed: false,
        reason: `Cannot ship or deliver a COD order with payment status "${payment.status}".`,
      };
    }
  }

  return { allowed: true };
}

