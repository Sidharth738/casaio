import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import { configureRazorpayTimeout, getActivePaymentAttemptRef, getCaptureReconciliationReason, isCapturedPaymentForOrder } from '@/lib/payment/attempts';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import { rupeesToPaise } from '@/lib/orders/money';
import { stageOnlineReservationConsumed } from '@/lib/coupons/user-usage';
import { getPaymentConfirmationState } from '@/lib/payment/confirmation-state';

export async function GET(req: NextRequest) {
  try {
    const user = await requireServerUser(req);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const orderId = req.nextUrl.searchParams.get('orderId');
    const razorpayOrderId = req.nextUrl.searchParams.get('razorpayOrderId');
    const razorpayPaymentId = req.nextUrl.searchParams.get('razorpayPaymentId');
    if (!orderId || !razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ error: 'Missing payment status details' }, { status: 400 });
    }

    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    const order = orderSnap.data();
    if (!orderSnap.exists || order?.customerId !== user.uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.payment?.method !== 'razorpay' || order.payment?.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json({ error: 'Payment does not match this order' }, { status: 409 });
    }

    return NextResponse.json({
      paymentStatus: order.payment?.status || 'pending',
      orderStatus: order.orderStatus,
      matchesAttempt: order.payment?.status === 'captured' && order.payment?.razorpayPaymentId === razorpayPaymentId,
      confirmationState: getPaymentConfirmationState(order),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Payment status lookup failed');
    return NextResponse.json({ error: 'Unable to confirm payment status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireServerUser(req);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ error: 'Missing payment verification credentials' }, { status: 400 });
    }

    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.customerId !== user.uid) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const orderData = orderSnap.data()!;
    if (orderData.payment?.method !== 'razorpay' || orderData.payment?.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json({ error: 'Payment does not match this order' }, { status: 409 });
    }
    if (orderData.payment?.status === 'refunded' || orderData.payment?.status === 'refund_pending' ||
        orderData.payment?.status === 'refund_failed') {
      return NextResponse.json({ error: 'This order is already in a refund state and requires support review' }, { status: 409 });
    }
    const isLegacyFinalized = orderData.payment?.status === 'failed' || Boolean(orderData.payment?.failureFinalizedAt) ||
      orderData.orderStatus === 'cancelled' || orderData.cancellationStatus === 'completed';
    if (orderData.payment?.status !== 'pending' && orderData.payment?.status !== 'authorized' &&
        orderData.payment?.status !== 'captured' && !isLegacyFinalized) {
      return NextResponse.json({ error: 'Order is not awaiting payment verification' }, { status: 409 });
    }

    const configuration = getRazorpayConfiguration();
    const isSimulationOrder = razorpayOrderId.startsWith('order_sim_');
    const isSimulation = configuration.mode === 'simulation';
    if (isSimulation !== isSimulationOrder) {
      return NextResponse.json({ error: 'Payment mode does not match this order' }, { status: 409 });
    }

    // Verify the Checkout signature before treating a callback as successful.
    let isValid = false;
    if (isSimulation) {
      isValid = razorpaySignature === 'simulated_signature_valid';
    } else {
      if (typeof razorpaySignature !== 'string') return NextResponse.json({ error: 'Payment signature is required' }, { status: 400 });
      const generatedSignature = crypto
        .createHmac('sha256', configuration.keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      const expected = Buffer.from(generatedSignature);
      const actual = Buffer.from(razorpaySignature);
      isValid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    if (!isSimulation) {
      const razorpay = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
      configureRazorpayTimeout(razorpay);
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      const expectedAmount = rupeesToPaise(Number(orderData.pricing?.totalAmount || 0));
      if (!isCapturedPaymentForOrder(payment, { paymentId: razorpayPaymentId, orderId: razorpayOrderId, amount: expectedAmount })) {
        return NextResponse.json({ error: 'Payment is not captured for the expected order amount' }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const activeAttemptRef = getActivePaymentAttemptRef(user.uid);
      const activeAttemptSnap = await transaction.get(activeAttemptRef);
      const currentOrder = snapshot.data();
      if (!snapshot.exists || !currentOrder || currentOrder.customerId !== user.uid) return 'missing';
      if (currentOrder.payment?.method !== 'razorpay' || currentOrder.payment?.razorpayOrderId !== razorpayOrderId) return 'order-mismatch';

      if (currentOrder.payment?.status === 'captured') {
        await stageOnlineReservationConsumed(transaction, adminDb, currentOrder, orderId, now);
        if (currentOrder.payment?.razorpayPaymentId === razorpayPaymentId) {
          if (getPaymentConfirmationState(currentOrder) === 'confirmed') return 'already-captured';
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': currentOrder.payment?.reconciliationReason || 'captured_order_state_inconsistent',
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        transaction.update(orderRef, {
          'payment.reconciliationRequired': true,
          'payment.reconciliationStatus': 'open',
          'payment.reconciliationReason': 'additional_captured_payment_id',
          'payment.reconciliationPaymentIds': FieldValue.arrayUnion(razorpayPaymentId),
          updatedAt: now,
        });
        return 'reconciliation-required';
      }
      const currentNeedsReconciliation = currentOrder.payment?.status === 'failed' || Boolean(currentOrder.payment?.failureFinalizedAt) ||
        currentOrder.orderStatus === 'cancelled' || currentOrder.cancellationStatus === 'completed';
      if (currentOrder.payment?.status !== 'pending' && currentOrder.payment?.status !== 'authorized' && !currentNeedsReconciliation) return 'state-conflict';
      const reconciliationReason = getCaptureReconciliationReason(currentOrder, razorpayPaymentId);
      const reconciliationRequired = currentNeedsReconciliation || Boolean(reconciliationReason);

      await stageOnlineReservationConsumed(transaction, adminDb, currentOrder, orderId, now);

      transaction.update(orderRef, {
        'payment.status': 'captured',
        'payment.razorpayOrderId': razorpayOrderId,
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.razorpaySignature': isSimulation ? 'simulated' : razorpaySignature,
        'payment.paidAt': now,
        ...(reconciliationRequired ? {
          'payment.reconciliationRequired': true,
          'payment.reconciliationStatus': 'open',
          'payment.reconciliationReason': reconciliationReason || 'capture_requires_reconciliation',
          'payment.reconciliationPaymentIds': FieldValue.arrayUnion(razorpayPaymentId),
        } : { orderStatus: 'confirmed' }),
        statusTimeline: [
          ...(currentOrder.statusTimeline || []),
          {
            status: reconciliationRequired ? 'payment_reconciliation' : 'confirmed',
            timestamp: now,
            note: `Online payment of ₹${currentOrder.pricing?.totalAmount?.toLocaleString('en-IN')} verified successfully via Razorpay (Payment ID: ${razorpayPaymentId}).`,
            updatedBy: 'system',
          },
        ],
        updatedAt: now,
      });
      if (activeAttemptSnap.exists && activeAttemptSnap.data()?.orderId === orderId) {
        transaction.delete(activeAttemptRef);
      }

      return reconciliationRequired ? 'reconciliation-required' : 'captured';
    });

    if (result === 'missing') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (result === 'order-mismatch' || result === 'state-conflict') {
      return NextResponse.json({ error: 'Payment does not match the current order state' }, { status: 409 });
    }

    if (result === 'reconciliation-required') {
      return NextResponse.json({
        success: true,
        confirmationState: 'reconciliation_required',
        paymentStatus: 'captured',
        message: 'Payment was captured, but the order requires review before confirmation.',
        orderId,
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({
      success: true,
      confirmationState: 'confirmed',
      paymentStatus: 'captured',
      alreadyCaptured: result === 'already-captured',
      message: 'Payment verified and order confirmed',
      orderId,
    });
  } catch (error: unknown) {
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ error: 'Payment configuration is invalid' }, { status: 503 });
    }
    console.error('Payment verification failed');
    return NextResponse.json({ error: 'Payment verification processing failed' }, { status: 500 });
  }
}
