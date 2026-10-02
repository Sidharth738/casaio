import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';

export async function POST(req: NextRequest) {
  try {
    const user = await requireServerUser(req);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.customerId !== user.uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const orderData = orderSnap.data()!;
    if (orderData.payment?.status !== 'pending' || orderData.payment?.method !== 'razorpay') {
      return NextResponse.json({ error: 'Order is not awaiting online payment' }, { status: 409 });
    }
    if (orderData.payment?.razorpayOrderId) {
      return NextResponse.json({
        id: orderData.payment.razorpayOrderId,
        amount: Math.round(Number(orderData.pricing.totalAmount) * 100),
        currency: 'INR',
        isSimulation: orderData.payment.razorpayOrderId.startsWith('order_sim_'),
      });
    }
    const amount = Number(orderData.pricing?.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 });

    const key_id =
      process.env.RAZORPAY_KEY_ID ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
    const isPlaceholder = (value: string) => /placeholder|fake|change_me/i.test(value);
    const hasLiveCredentials = Boolean(key_id && key_secret && !isPlaceholder(key_id) && !isPlaceholder(key_secret));

    // Amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(amount * 100);

    // If using placeholder credentials, provide a mock Razorpay order for seamless dev experience
    if (!hasLiveCredentials) {
      if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 503 });
      const mockOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await orderRef.update({ 'payment.razorpayOrderId': mockOrderId, updatedAt: new Date().toISOString() });
      return NextResponse.json({
        id: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${orderId.slice(0, 20)}`,
        status: 'created',
        isSimulation: true,
      });
    }

    const instance = new Razorpay({
      key_id,
      key_secret,
    });

    const order = await instance.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${orderId.slice(0, 20)}`,
      notes: { orderId, customerId: user.uid },
    });

    await orderRef.update({ 'payment.razorpayOrderId': order.id, updatedAt: new Date().toISOString() });

    return NextResponse.json(order);
  } catch (error: unknown) {
    console.error('Razorpay order creation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to initiate payment gateway order';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
