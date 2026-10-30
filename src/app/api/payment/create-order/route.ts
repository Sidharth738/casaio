import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import type { Transaction } from 'firebase-admin/firestore';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { canRetryExistingOrder, configureRazorpayTimeout, getActivePaymentAttemptRef } from '@/lib/payment/attempts';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import { rupeesToPaise } from '@/lib/orders/money';

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
    const activeAttemptSnap = await getActivePaymentAttemptRef(user.uid).get();
    if (!activeAttemptSnap.exists || activeAttemptSnap.data()?.orderId !== orderId) {
      return NextResponse.json({ error: 'This order is not the active payment attempt' }, { status: 409 });
    }
    const configuration = getRazorpayConfiguration();
    if (orderData.payment?.razorpayOrderId) {
      const isSimulationOrder = orderData.payment.razorpayOrderId.startsWith('order_sim_');
      if (configuration.mode === 'simulation') {
        if (!isSimulationOrder) {
          return NextResponse.json({ error: 'Payment mode does not match this order' }, { status: 409 });
        }
        return NextResponse.json({
          id: orderData.payment.razorpayOrderId,
          amount: rupeesToPaise(Number(orderData.pricing.totalAmount)),
          currency: 'INR',
          pricing: orderData.pricing,
          isSimulation: true,
        });
      }
      if (isSimulationOrder) {
        return NextResponse.json({ error: 'Payment mode does not match this order' }, { status: 409 });
      }
      const existingClient = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
      configureRazorpayTimeout(existingClient);
      const [providerOrder, paymentList] = await Promise.all([
        existingClient.orders.fetch(orderData.payment.razorpayOrderId),
        existingClient.orders.fetchPayments(orderData.payment.razorpayOrderId),
      ]);
      const expectedAmount = rupeesToPaise(Number(orderData.pricing.totalAmount));
      if (providerOrder.id !== orderData.payment.razorpayOrderId || providerOrder.amount !== expectedAmount ||
          providerOrder.currency !== 'INR' || providerOrder.status === 'paid' ||
          paymentList.items.some((payment) => payment.status === 'authorized' || payment.status === 'captured')) {
        return NextResponse.json({ error: 'Payment status needs to be checked before resuming this order' }, { status: 409 });
      }
      if (!canRetryExistingOrder(providerOrder, paymentList.items)) {
        return NextResponse.json({ error: 'Payment outcome is not confirmed; do not retry yet' }, { status: 409 });
      }
      return NextResponse.json({
        id: orderData.payment.razorpayOrderId,
        amount: rupeesToPaise(Number(orderData.pricing.totalAmount)),
        currency: 'INR',
        pricing: orderData.pricing,
        keyId: configuration.keyId,
        isSimulation: false,
      });
    }
    const amount = Number(orderData.pricing?.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 });

    // Amount in paise (1 INR = 100 paise)
    const amountInPaise = rupeesToPaise(amount);

    if (configuration.mode === 'simulation') {
      const mockOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await orderRef.update({ 'payment.razorpayOrderId': mockOrderId, updatedAt: new Date().toISOString() });
      return NextResponse.json({
        id: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        pricing: orderData.pricing,
        receipt: `rcpt_${orderId.slice(0, 20)}`,
        status: 'created',
        isSimulation: true,
      });
    }

    const instance = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
    configureRazorpayTimeout(instance);
    const receipt = `rcpt_${orderId.slice(0, 20)}`;

    // Receipt is stable per Firestore order so an SDK timeout cannot create
    // a second Razorpay order on a later explicit recovery request.
    const existingGatewayOrders = await instance.orders.all({ receipt, count: 1 });
    let gatewayOrder = existingGatewayOrders.items.find((candidate) => candidate.receipt === receipt);
    if (gatewayOrder && (gatewayOrder.amount !== amountInPaise || gatewayOrder.currency !== 'INR')) {
      return NextResponse.json({ error: 'Existing payment order does not match this order' }, { status: 409 });
    }

    if (!gatewayOrder) {
      try {
        gatewayOrder = await instance.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: { orderId, customerId: user.uid },
        });
      } catch {
        // A timed-out create may have succeeded remotely. Only look it up by
        // the same unique receipt; never create a replacement receipt.
        try {
          const recovered = await instance.orders.all({ receipt, count: 1 });
          gatewayOrder = recovered.items.find((candidate) => candidate.receipt === receipt);
        } catch {
          return NextResponse.json({ error: 'Payment setup status is unknown. Refresh payment status before continuing.' }, { status: 503 });
        }
        if (!gatewayOrder) {
          return NextResponse.json({ error: 'Payment setup status is unknown. Refresh payment status before continuing.' }, { status: 503 });
        }
      }
    }

    if (!gatewayOrder?.id || gatewayOrder.amount !== amountInPaise || gatewayOrder.currency !== 'INR') {
      return NextResponse.json({ error: 'Payment setup could not be confirmed' }, { status: 503 });
    }

    const persistResult = await adminDb.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(orderRef);
      const current = snapshot.data();
      if (!snapshot.exists || current?.customerId !== user.uid || current.payment?.method !== 'razorpay') return 'missing';
      if (current.payment?.status !== 'pending' || current.payment?.razorpayOrderId && current.payment.razorpayOrderId !== gatewayOrder.id) return 'conflict';
      transaction.update(orderRef, {
        'payment.razorpayOrderId': gatewayOrder.id,
        updatedAt: new Date().toISOString(),
      });
      return 'saved';
    });
    if (persistResult !== 'saved') {
      return NextResponse.json({ error: 'Payment setup could not be attached to this order' }, { status: 409 });
    }

    return NextResponse.json({ ...gatewayOrder, pricing: orderData.pricing, keyId: configuration.keyId, isSimulation: false });
  } catch (error: unknown) {
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ error: 'Payment configuration is invalid' }, { status: 503 });
    }
    console.error('Razorpay order creation failed');
    return NextResponse.json({ error: 'Failed to initiate payment gateway order' }, { status: 500 });
  }
}
