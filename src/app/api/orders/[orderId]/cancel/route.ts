import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import type { OrderItem } from '@/types';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef } from '@/lib/payment/attempts';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import { rupeesToPaise } from '@/lib/orders/money';
import { buildCancellationInventoryUpdates } from '@/lib/orders/cancellation-inventory';
import { getCouponUserUsageRefs } from '@/lib/coupons/user-usage';

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await requireServerUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { orderId } = await params;
    const orderRef = adminDb.collection('orders').doc(orderId);
    const reservation = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists) return { error: 'Order not found', status: 404 } as const;

      const order = snapshot.data()!;
      if (order.customerId !== user.uid) return { error: 'Order not found', status: 404 } as const;
      if (order.orderStatus === 'cancelled') return { alreadyCancelled: true } as const;
      if (order.cancellationStatus === 'processing') {
        return { error: 'Cancellation is already being processed', status: 409 } as const;
      }
      if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
        return { error: 'This order can no longer be cancelled because fulfillment has progressed', status: 409 } as const;
      }
      if (!Array.isArray(order.items) || order.items.length === 0 || order.items.some((item: OrderItem) => item.fulfillmentStatus !== 'pending')) {
        return { error: 'This order can no longer be cancelled because fulfillment has started', status: 409 } as const;
      }

      const payment = order.payment || {};
      const isCod = payment.method === 'cod' && payment.status === 'pending';
      const isPaidOnline = payment.method === 'razorpay' && payment.status === 'captured' && payment.razorpayPaymentId;
      if (!isCod && !isPaidOnline) {
        return { error: 'Online payment is still pending or unavailable. Please wait for payment to finish before cancelling.', status: 409 } as const;
      }

      transaction.update(orderRef, {
        cancellationStatus: 'processing',
        cancellationReason: 'Cancelled by customer',
        updatedAt: new Date().toISOString(),
      });
      return { order, isCod } as const;
    });

    if ('error' in reservation) {
      return NextResponse.json({ error: reservation.error }, { status: reservation.status });
    }
    if ('alreadyCancelled' in reservation) {
      return NextResponse.json({ success: true, message: 'Order is already cancelled' });
    }

    const { order, isCod } = reservation;
    let refund: { id: string; status: string } | null = null;

    if (!isCod) {
      let configuration;
      try {
        configuration = getRazorpayConfiguration();
      } catch (error: unknown) {
        if (!(error instanceof RazorpayConfigurationError)) throw error;
        await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        return NextResponse.json({ error: 'Payment configuration is invalid' }, { status: 503 });
      }
      if (configuration.mode === 'simulation' || order.payment.razorpayPaymentId?.startsWith('pay_sim_')) {
        await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        return NextResponse.json({ error: 'Simulated payments cannot be refunded through Razorpay.' }, { status: 409 });
      }

      const razorpay = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
      const paymentId = order.payment.razorpayPaymentId as string;
      const receipt = `cancel_${orderId}`;
      try {
        const existingRefunds = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100 });
        const existingRefund = existingRefunds.items.find((item) => item.receipt === receipt && item.status !== 'failed');
        refund = existingRefund
          ? { id: existingRefund.id, status: existingRefund.status }
          : await razorpay.payments.refund(paymentId, {
              amount: rupeesToPaise(Number(order.pricing?.totalAmount || 0)),
              speed: 'normal',
              receipt,
              notes: { orderId, customerId: user.uid, reason: 'Customer cancellation' },
            });
      } catch {
        console.error('Order cancellation refund failed');
        await adminDb.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(orderRef);
          if (snapshot.exists && snapshot.data()?.cancellationStatus === 'processing') {
            transaction.update(orderRef, { cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
          }
        });
        return NextResponse.json({ error: 'We could not start the refund, so the order was not cancelled. Please try again or contact support.' }, { status: 502 });
      }
    }

    const now = new Date().toISOString();
    try {
      const completion = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists) throw new Error('Order not found while completing cancellation');
        const current = snapshot.data()!;
        if (current.cancellationStatus !== 'processing') {
          if (current.orderStatus === 'cancelled' && current.cancellationStatus === 'completed' &&
              refund && current.payment?.status === 'refunded' && current.payment?.razorpayRefundId === refund.id) {
            return { failed: false as const, pending: false as const, paymentStatus: 'refunded' };
          }
          throw new Error('Order cancellation state changed');
        }

        let releaseCouponReservation: FirebaseFirestore.DocumentReference | null = null;
        let nextCouponUsageCount: number | null = null;
        const couponId = current.couponApplied?.couponId;
        if (current.payment?.method === 'cod' && typeof couponId === 'string' &&
            typeof current.customerId === 'string') {
          const refs = getCouponUserUsageRefs(adminDb, couponId, current.customerId, orderId);
          const [usageSnap, reservationSnap] = await Promise.all([
            transaction.get(refs.usageRef),
            transaction.get(refs.reservationRef),
          ]);
          if (usageSnap.exists || reservationSnap.exists) {
            const usage = usageSnap.data();
            const couponReservation = reservationSnap.data();
            if (!usageSnap.exists || usage?.state !== 'ready' || !reservationSnap.exists ||
                couponReservation?.couponId !== couponId || couponReservation?.customerId !== current.customerId ||
                couponReservation?.orderId !== orderId || !Number.isSafeInteger(usage?.occupiedCount) ||
                (usage.occupiedCount as number) < 0) {
              throw new Error('Coupon cancellation reservation requires reconciliation');
            }
            if (couponReservation.state === 'awaiting_delivery') {
              if ((usage.occupiedCount as number) < 1) throw new Error('Coupon usage counter is inconsistent');
              releaseCouponReservation = refs.reservationRef;
              nextCouponUsageCount = (usage.occupiedCount as number) - 1;
            } else if (couponReservation.state !== 'released') {
              throw new Error('Coupon reservation cannot be released after consumption');
            }
          }
        }

        let paymentStatus: string | undefined;
        if (refund) {
          if (current.payment?.method !== 'razorpay' ||
              current.payment?.razorpayPaymentId !== order.payment.razorpayPaymentId ||
              (current.payment?.razorpayRefundId && current.payment.razorpayRefundId !== refund.id)) {
            throw new Error('Refund does not match the active order payment');
          }
          // A webhook may have completed or failed the same refund while the
          // provider response was in flight. Never replace that terminal state
          // with a stale response from the cancellation request.
          if (current.payment?.status === 'refunded') paymentStatus = 'refunded';
          else if (current.payment?.status === 'refund_failed' || refund.status === 'failed') {
            transaction.update(orderRef, {
              cancellationStatus: 'failed',
              'payment.razorpayRefundId': refund.id,
              ...(current.payment?.status !== 'refund_failed' ? { 'payment.status': 'refund_failed' } : {}),
              updatedAt: now,
            });
            return { failed: true as const };
          } else {
            paymentStatus = refund.status === 'processed' ? 'refunded' : 'refund_pending';
          }

          if (paymentStatus === 'refund_pending') {
            transaction.update(orderRef, {
              'payment.status': 'refund_pending',
              'payment.razorpayRefundId': refund.id,
              updatedAt: now,
            });
            return { failed: false as const, pending: true as const, paymentStatus };
          }
        }

        const items = current.items as OrderItem[];
        const productRefs = Array.from(new Set(items.map((item) => item.productId)))
          .map((productId) => adminDb.collection('products').doc(productId));
        const [productSnapshots, activeAttemptSnap, checkoutCoordinationSnap] = await Promise.all([
          Promise.all(productRefs.map((ref) => transaction.get(ref))),
          transaction.get(getActivePaymentAttemptRef(user.uid)),
          transaction.get(getCheckoutCoordinationRef(user.uid)),
        ]);
        const productData = new Map<string, Record<string, unknown>>();
        for (let index = 0; index < productRefs.length; index++) {
          const snapshot = productSnapshots[index];
          if (snapshot.exists) productData.set(productRefs[index].id, snapshot.data() || {});
        }
        const inventoryRestoration = buildCancellationInventoryUpdates(items, productData, now);
        if (!inventoryRestoration.ok) {
          if (refund && paymentStatus === 'refunded') {
            transaction.update(orderRef, {
              cancellationStatus: 'failed',
              'payment.status': 'refunded',
              'payment.razorpayRefundId': refund.id,
              'payment.reconciliationRequired': true,
              'payment.reconciliationStatus': 'open',
              'payment.reconciliationReason': 'cancellation_inventory_restore_failed',
              updatedAt: now,
            });
            return { failed: true as const, pending: false as const, inventoryConflict: true as const };
          }
          throw new Error(inventoryRestoration.error);
        }
        for (const [productId, updates] of inventoryRestoration.updates) {
          transaction.update(adminDb.collection('products').doc(productId), updates);
        }

        transaction.update(orderRef, {
          orderStatus: 'cancelled',
          items: items.map((item) => ({ ...item, fulfillmentStatus: 'cancelled' })),
          cancellationStatus: 'completed',
          ...(refund ? {
            'payment.status': paymentStatus!,
            'payment.razorpayRefundId': refund.id,
          } : {}),
          statusTimeline: [
            ...(current.statusTimeline || []),
            {
              status: 'cancelled',
              timestamp: now,
              note: refund && paymentStatus !== 'refunded'
                ? 'Order cancelled. Your Razorpay refund is being processed.'
                : 'Order cancelled by the customer.',
              updatedBy: user.uid,
            },
          ],
          updatedAt: now,
        });
        if (releaseCouponReservation && nextCouponUsageCount !== null) {
          transaction.update(releaseCouponReservation, { state: 'released', updatedAt: now });
          const usageRef = releaseCouponReservation.parent.parent;
          if (!usageRef) throw new Error('Coupon usage ledger path is invalid');
          transaction.update(usageRef, { occupiedCount: nextCouponUsageCount, updatedAt: now });
        }
        const activeAttemptRef = getActivePaymentAttemptRef(user.uid);
        if (activeAttemptSnap.data()?.orderId === orderId) transaction.delete(activeAttemptRef);
        const checkoutCoordinationRef = getCheckoutCoordinationRef(user.uid);
        if (checkoutCoordinationSnap.data()?.orderId === orderId) transaction.delete(checkoutCoordinationRef);
        return { failed: false as const, pending: false as const, paymentStatus };
      });
      if (completion.failed) {
        if ('inventoryConflict' in completion && completion.inventoryConflict) {
          return NextResponse.json({ error: 'Refund completed, but inventory restoration needs support review.' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Refund could not be started, so the order was not cancelled. Please contact support.' }, { status: 502 });
      }
      if (completion.pending) {
        return NextResponse.json({
          success: true,
          message: 'Your refund is processing. The order will be cancelled after Razorpay confirms it.',
          paymentStatus: 'refund_pending',
        }, { status: 202 });
      }
      const paymentStatus = completion.paymentStatus;
      return NextResponse.json({
        success: true,
        message: refund && paymentStatus !== 'refunded'
          ? 'Order cancelled. Your refund is being processed.'
          : 'Order cancelled successfully.',
        paymentStatus: refund ? paymentStatus : 'pending',
      });
    } catch (error) {
      // If Razorpay accepted a refund but Firestore completion failed, allow a retry.
      // The retry checks for the existing refund receipt before creating another one.
      await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (snapshot.exists && snapshot.data()?.cancellationStatus === 'processing') {
          transaction.update(orderRef, { cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        }
      });
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ error: 'Payment configuration is invalid' }, { status: 503 });
    }
    console.error('Order cancellation failed');
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
  }
}
