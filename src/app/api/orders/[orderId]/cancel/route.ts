import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import type { OrderItem } from '@/types';

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
      const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
      if (!keyId || !keySecret || /placeholder|fake|change_me/i.test(keyId + keySecret)) {
        await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        return NextResponse.json({ error: 'Refund processing is not configured. Please contact support.' }, { status: 503 });
      }

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const paymentId = order.payment.razorpayPaymentId as string;
      const receipt = `cancel_${orderId}`;
      try {
        const existingRefunds = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100 });
        const existingRefund = existingRefunds.items.find((item) => item.receipt === receipt && item.status !== 'failed');
        refund = existingRefund
          ? { id: existingRefund.id, status: existingRefund.status }
          : await razorpay.payments.refund(paymentId, {
              amount: Math.round(Number(order.pricing?.totalAmount || 0) * 100),
              speed: 'normal',
              receipt,
              notes: { orderId, customerId: user.uid, reason: 'Customer cancellation' },
            });
      } catch (error) {
        console.error('Order cancellation refund failed:', error);
        await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        return NextResponse.json({ error: 'We could not start the refund, so the order was not cancelled. Please try again or contact support.' }, { status: 502 });
      }

      if (refund.status === 'failed') {
        await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
        return NextResponse.json({ error: 'Refund could not be started, so the order was not cancelled. Please contact support.' }, { status: 502 });
      }
    }

    const now = new Date().toISOString();
    try {
      await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists) throw new Error('Order not found while completing cancellation');
        const current = snapshot.data()!;
        if (current.cancellationStatus !== 'processing') throw new Error('Order cancellation state changed');

        const items = current.items as OrderItem[];
        const productRefs = items.map((item) => adminDb.collection('products').doc(item.productId));
        const productSnapshots = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
        for (let index = 0; index < productRefs.length; index++) {
          const product = productSnapshots[index];
          if (product.exists) {
            transaction.update(productRefs[index], {
              stock: Number(product.data()?.stock || 0) + items[index].quantity,
              salesCount: Math.max(0, Number(product.data()?.salesCount || 0) - items[index].quantity),
              updatedAt: now,
            });
          }
        }

        transaction.update(orderRef, {
          orderStatus: 'cancelled',
          items: items.map((item) => ({ ...item, fulfillmentStatus: 'cancelled' })),
          cancellationStatus: 'completed',
          ...(refund ? {
            'payment.status': refund.status === 'processed' ? 'refunded' : 'refund_pending',
            'payment.razorpayRefundId': refund.id,
          } : {}),
          statusTimeline: [
            ...(current.statusTimeline || []),
            {
              status: 'cancelled',
              timestamp: now,
              note: refund && refund.status !== 'processed'
                ? 'Order cancelled. Your Razorpay refund is being processed.'
                : 'Order cancelled by the customer.',
              updatedBy: user.uid,
            },
          ],
          updatedAt: now,
        });
      });
    } catch (error) {
      // If Razorpay accepted a refund but Firestore completion failed, allow a retry.
      // The retry checks for the existing refund receipt before creating another one.
      await orderRef.update({ cancellationStatus: 'failed', updatedAt: new Date().toISOString() });
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: refund && refund.status !== 'processed'
        ? 'Order cancelled. Your refund is being processed.'
        : 'Order cancelled successfully.',
      paymentStatus: refund ? (refund.status === 'processed' ? 'refunded' : 'refund_pending') : 'pending',
    });
  } catch (error: unknown) {
    console.error('Order cancellation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel order';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
