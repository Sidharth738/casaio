import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || /placeholder|fake|change_me/i.test(secret)) {
    return NextResponse.json({ error: 'Payment webhook is not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const providedSignature = request.headers.get('x-razorpay-signature') || '';
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBytes = Buffer.from(expectedSignature);
  const providedBytes = Buffer.from(providedSignature);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; error_description?: string } } };
    };
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) return NextResponse.json({ received: true });

    const orders = await adminDb.collection('orders')
      .where('payment.razorpayOrderId', '==', payment.order_id)
      .limit(1)
      .get();
    if (orders.empty) return NextResponse.json({ received: true });

    const orderRef = orders.docs[0].ref;
    if (event.event === 'payment.failed') {
      await orderRef.update({
        'payment.lastFailureAt': new Date().toISOString(),
        'payment.lastFailureReason': payment.error_description || 'Payment failed',
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ received: true });
    }
    if (event.event !== 'payment.captured') return NextResponse.json({ received: true });

    const now = new Date().toISOString();
    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const order = snapshot.data();
      if (!snapshot.exists || !order) return 'missing';
      if (order.payment?.status === 'captured') {
        return order.payment?.razorpayPaymentId === payment.id ? 'already-paid' : 'conflict';
      }
      if (order.payment?.status !== 'pending' || order.payment?.razorpayOrderId !== payment.order_id) return 'conflict';
      const expectedAmount = Math.round(Number(order.pricing?.totalAmount || 0) * 100);
      if (payment.amount !== expectedAmount || payment.currency !== 'INR') return 'amount-mismatch';

      transaction.update(orderRef, {
        'payment.status': 'captured',
        'payment.razorpayPaymentId': payment.id,
        'payment.paidAt': now,
        orderStatus: 'confirmed',
        statusTimeline: [
          ...(order.statusTimeline || []),
          {
            status: 'confirmed',
            timestamp: now,
            note: `Payment captured by Razorpay (Payment ID: ${payment.id}).`,
            updatedBy: 'system',
          },
        ],
        updatedAt: now,
      });
      return 'paid';
    });

    if (result === 'amount-mismatch') return NextResponse.json({ error: 'Captured amount does not match the order' }, { status: 400 });
    if (result === 'conflict') return NextResponse.json({ error: 'Order payment state conflicts with this event' }, { status: 409 });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error('Razorpay webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
