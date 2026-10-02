import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';

export async function POST(req: NextRequest) {
  try {
    const user = await requireServerUser(req);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const {
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json(
        { error: 'Missing payment verification credentials' },
        { status: 400 }
      );
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';

    // Verify HMAC-SHA256 signature
    let isValid = false;

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.customerId !== user.uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const orderData = orderSnap.data()!;
    if (orderData.payment?.status !== 'pending' || orderData.payment?.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json({ error: 'Payment does not match this pending order' }, { status: 409 });
    }

    const isPlaceholderSecret = /placeholder|fake|change_me/i.test(key_secret);
    if (process.env.NODE_ENV !== 'production' && (!key_secret || isPlaceholderSecret) && razorpayOrderId.startsWith('order_sim_')) {
      isValid = true;
    } else {
      if (!key_secret || typeof razorpaySignature !== 'string') return NextResponse.json({ error: 'Payment verification is not configured' }, { status: 503 });
      const generatedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      const expected = Buffer.from(generatedSignature);
      const actual = Buffer.from(razorpaySignature);
      isValid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Payment signature verification failed' },
        { status: 400 }
      );
    }

    const isSimulation = process.env.NODE_ENV !== 'production' &&
      razorpayOrderId.startsWith('order_sim_') && (!key_secret || isPlaceholderSecret);
    if (!isSimulation) {
      if (!key_id || /placeholder|fake|change_me/i.test(key_id)) {
        return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 503 });
      }
      const razorpay = new Razorpay({ key_id, key_secret });
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      const expectedAmount = Math.round(Number(orderData.pricing?.totalAmount || 0) * 100);
      if (payment.order_id !== razorpayOrderId || payment.amount !== expectedAmount || payment.currency !== 'INR' || payment.status !== 'captured') {
        return NextResponse.json({ error: 'Payment is not captured for the expected order amount' }, { status: 409 });
      }
    }

    // Update order status in Firestore
    const now = new Date().toISOString();

    const updatedTimeline = [
      ...(orderData?.statusTimeline || []),
      {
        status: 'confirmed',
        timestamp: now,
        note: `Online payment of ₹${orderData?.pricing?.totalAmount?.toLocaleString('en-IN')} verified successfully via Razorpay (Payment ID: ${razorpayPaymentId}).`,
        updatedBy: 'system',
      },
    ];

    await orderRef.update({
      'payment.status': 'captured',
      'payment.razorpayOrderId': razorpayOrderId,
      'payment.razorpayPaymentId': razorpayPaymentId,
      'payment.razorpaySignature': razorpaySignature || 'simulated',
      'payment.paidAt': now,
      orderStatus: 'confirmed',
      statusTimeline: updatedTimeline,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      message: 'Payment verified and order confirmed',
      orderId,
    });
  } catch (error: unknown) {
    console.error('Payment verification error:', error);
    const msg = error instanceof Error ? error.message : 'Payment verification processing failed';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
