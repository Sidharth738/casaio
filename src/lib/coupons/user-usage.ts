import { createHash } from 'node:crypto';
import type { Order } from '@/types';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export const MAX_LEGACY_CUSTOMER_ORDERS_FOR_BOOTSTRAP = 8;

export type CouponUserReservationState = 'reserved' | 'awaiting_delivery' | 'consumed' | 'released';

export function getCouponUserUsageKey(couponId: string, customerId: string): string {
  return createHash('sha256').update(JSON.stringify([couponId, customerId])).digest('hex');
}

export function getCouponUserUsageRefs(
  adminDb: Firestore,
  couponId: string,
  customerId: string,
  orderId: string
) {
  const usageRef = adminDb.collection('couponUserUsage').doc(getCouponUserUsageKey(couponId, customerId));
  return { usageRef, reservationRef: usageRef.collection('reservations').doc(orderId) };
}

/** Captured online payments consume their existing held slot; the counter is unchanged. */
export async function stageOnlineReservationConsumed(
  transaction: Transaction,
  adminDb: Firestore,
  value: unknown,
  orderId: string,
  now: string
): Promise<void> {
  if (!value || typeof value !== 'object') return;
  const order = value as Partial<Order>;
  const couponId = order.couponApplied?.couponId;
  const customerId = order.customerId;
  if (order.payment?.method !== 'razorpay' || !couponId || !customerId) return;

  const { usageRef, reservationRef } = getCouponUserUsageRefs(adminDb, couponId, customerId, orderId);
  const [usageSnap, reservationSnap] = await Promise.all([
    transaction.get(usageRef),
    transaction.get(reservationRef),
  ]);
  if (!reservationSnap.exists) return; // Legacy order not yet bootstrapped.
  const reservation = reservationSnap.data();
  if (usageSnap.data()?.state !== 'ready' || reservation?.state === 'consumed') return;
  if (reservation?.state === 'reserved') {
    transaction.update(reservationRef, { state: 'consumed', updatedAt: now });
  }
}

/** Returns the legacy accounting state, or `ambiguous` when identity is inconsistent. */
type LegacyCouponOrder = {
  couponApplied?: { code?: unknown; couponId?: unknown };
  payment?: { method?: unknown; status?: unknown };
  orderStatus?: unknown;
  cancellationStatus?: unknown;
};

export function getLegacyCouponReservationState(
  value: unknown,
  couponId: string,
  normalizedCode: string
): CouponUserReservationState | 'ambiguous' | null {
  if (!value || typeof value !== 'object') return null;
  const order = value as LegacyCouponOrder;
  const applied = order.couponApplied;
  if (!applied || typeof applied !== 'object') return null;
  if (applied.couponId !== undefined && typeof applied.couponId !== 'string') return 'ambiguous';
  const orderCode = typeof applied.code === 'string' ? applied.code.trim().toUpperCase() : '';
  const orderCouponId = typeof applied.couponId === 'string' ? applied.couponId : undefined;
  const matchesId = orderCouponId === couponId;
  const matchesCode = orderCode === normalizedCode;

  if (matchesId && !matchesCode) return 'ambiguous';
  if (orderCouponId && matchesCode && !matchesId) return 'ambiguous';
  if (!matchesId && !matchesCode) return null;

  if (order.payment?.method === 'razorpay') {
    // Failed payments are intentionally retained in this phase. A late capture
    // may still be possible, and refunds never restore a coupon slot.
    if (typeof order.payment.status === 'string' &&
        ['pending', 'authorized', 'failed', 'captured', 'refund_pending', 'refund_failed', 'refunded'].includes(order.payment.status)) {
      return order.payment.status === 'captured' || order.payment.status === 'refund_pending' ||
        order.payment.status === 'refund_failed' || order.payment.status === 'refunded'
        ? 'consumed'
        : 'reserved';
    }
    return 'ambiguous';
  }

  if (order.payment?.method === 'cod') {
    if (order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed') return 'released';
    return order.orderStatus === 'delivered' ? 'consumed' : 'awaiting_delivery';
  }

  return 'ambiguous';
}
