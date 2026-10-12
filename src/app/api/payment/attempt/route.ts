import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import {
  canRetryExistingOrder,
  configureRazorpayTimeout,
  getCaptureReconciliationReason,
  getActivePaymentAttemptRef,
} from '@/lib/payment/attempts';

export const runtime = 'nodejs';

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireServerUser(request);
    if (!user) return json({ error: 'Authentication required' }, 401);

    const lockRef = getActivePaymentAttemptRef(user.uid);
    const lockSnap = await lockRef.get();
    if (!lockSnap.exists) return json({ active: false });
    const lock = lockSnap.data()!;
    if (lock.userId !== user.uid || typeof lock.orderId !== 'string') {
      return json({ active: true, status: 'unknown', retryAvailable: false });
    }

    const orderRef = adminDb.collection('orders').doc(lock.orderId);
    const orderSnap = await orderRef.get();
    const order = orderSnap.data();
    if (!orderSnap.exists || order?.customerId !== user.uid || order.payment?.method !== 'razorpay') {
      return json({ active: true, status: 'unknown', retryAvailable: false });
    }

    const activeReply = (status: string, retryAvailable = false) => json({
      active: true,
      status,
      retryAvailable,
      orderId: lock.orderId,
      orderNumber: order.orderNumber,
    });

    if (order.payment?.status === 'captured') {
      await adminDb.runTransaction(async (transaction) => {
        const [currentOrderSnap, currentLockSnap] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(lockRef),
        ]);
        if (currentOrderSnap.data()?.payment?.status === 'captured' &&
            currentOrderSnap.data()?.payment?.razorpayPaymentId === order.payment.razorpayPaymentId &&
            currentLockSnap.data()?.orderId === lock.orderId) {
          transaction.delete(lockRef);
        }
      });
      return activeReply('captured');
    }

    // Historical finalization is not proof of provider finality. Query the same
    // Razorpay order so a late capture can be recorded for manual reconciliation.
    if (order.payment?.status === 'refunded' || order.payment?.status === 'refund_pending' ||
        order.payment?.status === 'refund_failed') return activeReply('unknown');
    const isReconciliationState = order.payment?.status === 'failed' || Boolean(order.payment?.failureFinalizedAt) ||
      order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed';
    if (order.payment?.status !== 'pending' && order.payment?.status !== 'authorized' && !isReconciliationState) {
      return activeReply('unknown');
    }

    const razorpayOrderId = order.payment?.razorpayOrderId;
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!razorpayOrderId || razorpayOrderId.startsWith('order_sim_')) {
      return activeReply('pending', Boolean(razorpayOrderId));
    }
    if (!keyId || !keySecret || /placeholder|fake|change_me/i.test(keyId + keySecret)) {
      return activeReply('unknown');
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    configureRazorpayTimeout(razorpay);
    const [providerOrder, paymentList] = await Promise.all([
      razorpay.orders.fetch(razorpayOrderId),
      razorpay.orders.fetchPayments(razorpayOrderId),
    ]);
    const expectedAmount = Math.round(Number(order.pricing?.totalAmount || 0) * 100);
    if (providerOrder.id !== razorpayOrderId || providerOrder.amount !== expectedAmount ||
        providerOrder.currency !== 'INR' || !Array.isArray(paymentList.items)) {
      return activeReply('unknown');
    }

    const captured = paymentList.items.find((payment) =>
      payment.id && payment.order_id === razorpayOrderId && payment.status === 'captured' &&
      payment.amount === expectedAmount && payment.currency === 'INR'
    );
    if (captured) {
      const otherAuthorizedIds = paymentList.items
        .filter((payment) => payment.status === 'authorized' && payment.order_id === razorpayOrderId &&
          payment.amount === expectedAmount && payment.currency === 'INR' && payment.id !== captured.id)
        .map((payment) => payment.id)
        .filter((id): id is string => Boolean(id));
      const now = new Date().toISOString();
      const result = await adminDb.runTransaction(async (transaction) => {
        const [currentOrderSnap, currentLockSnap] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(lockRef),
        ]);
        const currentOrder = currentOrderSnap.data();
        if (!currentOrder || currentOrder.customerId !== user.uid ||
            currentOrder.payment?.method !== 'razorpay' ||
            currentOrder.payment?.razorpayOrderId !== razorpayOrderId ||
            currentLockSnap.data()?.orderId !== lock.orderId) return 'conflict';
        if (currentOrder.payment?.status === 'captured') {
          if (currentOrder.payment?.razorpayPaymentId === captured.id) return 'already-captured';
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'additional_captured_payment_id',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(captured.id),
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        const currentNeedsReconciliation = currentOrder.payment?.status === 'failed' || Boolean(currentOrder.payment?.failureFinalizedAt) ||
          currentOrder.orderStatus === 'cancelled' || currentOrder.cancellationStatus === 'completed';
        if (currentOrder.payment?.status !== 'pending' && currentOrder.payment?.status !== 'authorized' && !currentNeedsReconciliation) return 'conflict';
        const reconciliationReason = getCaptureReconciliationReason(currentOrder, captured.id);
        const reconciliationRequired = currentNeedsReconciliation || Boolean(reconciliationReason) || otherAuthorizedIds.length > 0;
        transaction.update(orderRef, {
          'payment.status': 'captured',
          'payment.razorpayPaymentId': captured.id,
          'payment.paidAt': now,
          ...(reconciliationRequired ? {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': reconciliationReason || 'additional_authorized_payment_attempts',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(captured.id, ...otherAuthorizedIds),
          } : { orderStatus: 'confirmed' }),
          statusTimeline: [
            ...(currentOrder.statusTimeline || []),
            {
              status: reconciliationRequired ? 'payment_reconciliation' : 'confirmed',
              timestamp: now,
              note: reconciliationRequired
                ? `Razorpay confirmed capture (Payment ID: ${captured.id}); manual order and inventory reconciliation is required.`
                : `Payment captured by Razorpay (Payment ID: ${captured.id}).`,
              updatedBy: 'system',
            },
          ],
          updatedAt: now,
        });
        transaction.delete(lockRef);
        return 'captured';
      });
      return activeReply(result === 'conflict' ? 'unknown' : 'captured');
    }

    const authorizedPayments = paymentList.items.filter((payment) =>
      payment.id && payment.order_id === razorpayOrderId && payment.status === 'authorized' &&
      payment.amount === expectedAmount && payment.currency === 'INR'
    );
    const hasAuthorized = authorizedPayments.length > 0;
    const hasUnfinished = paymentList.items.some((payment) => payment.status === 'created');
    if (hasAuthorized) {
      const authorizedIds = authorizedPayments.map((payment) => payment.id).filter((id): id is string => Boolean(id));
      await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        const currentOrder = snapshot.data();
        const currentNeedsReconciliation = currentOrder?.payment?.status === 'failed' || Boolean(currentOrder?.payment?.failureFinalizedAt) ||
          currentOrder?.orderStatus === 'cancelled' || currentOrder?.cancellationStatus === 'completed';
        if (currentOrder && (currentOrder.payment?.status === 'pending' || currentOrder.payment?.status === 'authorized' || currentNeedsReconciliation) &&
          currentOrder.payment.razorpayOrderId === razorpayOrderId) {
          const isLegacy = currentOrder.payment?.status === 'failed' || Boolean(currentOrder.payment?.failureFinalizedAt) ||
            currentOrder.orderStatus === 'cancelled' || currentOrder.cancellationStatus === 'completed';
          const previouslyAuthorizedId = currentOrder.payment?.razorpayAuthorizedPaymentId;
          const authorizationMismatch = Boolean(previouslyAuthorizedId &&
            authorizedIds.some((id) => id !== previouslyAuthorizedId));
          const multipleAuthorizations = authorizedIds.length > 1;
          if (authorizationMismatch || multipleAuthorizations) {
            transaction.update(orderRef, {
              ...(currentOrder.payment?.status === 'pending' || isLegacy ? {
                'payment.status': 'authorized',
                ...(authorizedIds.length === 1 ? { 'payment.razorpayAuthorizedPaymentId': authorizedIds[0] } : {}),
                'payment.authorizedAt': new Date().toISOString(),
              } : {}),
              'payment.reconciliationRequired': true,
              'payment.reconciliationStatus': 'open',
              'payment.reconciliationReason': 'multiple_authorized_payment_ids',
              ...(authorizedIds.length ? { 'payment.reconciliationPaymentIds': FieldValue.arrayUnion(...authorizedIds) } : {}),
              updatedAt: new Date().toISOString(),
            });
            return;
          }
          const uniqueAuthorizedId = authorizedIds.length === 1 ? authorizedIds[0] : undefined;
          transaction.update(orderRef, {
            'payment.status': 'authorized',
            ...(uniqueAuthorizedId ? { 'payment.razorpayAuthorizedPaymentId': uniqueAuthorizedId } : {}),
            ...(isLegacy ? {
              'payment.reconciliationRequired': true,
              'payment.reconciliationStatus': 'open',
              'payment.reconciliationReason': 'late_authorization_after_failure_or_cancellation',
              ...(authorizedIds.length ? { 'payment.reconciliationPaymentIds': FieldValue.arrayUnion(...authorizedIds) } : {}),
            } : {}),
            updatedAt: new Date().toISOString(),
          });
        }
      });
      return activeReply('authorized');
    }
    if (providerOrder.status === 'attempted' && paymentList.items.length > 0 &&
        paymentList.items.every((payment) => payment.status === 'failed')) {
      return activeReply('failed');
    }
    if (!hasUnfinished && canRetryExistingOrder(providerOrder, paymentList.items)) {
      return activeReply('pending', true);
    }
    return activeReply('unknown');
  } catch {
    console.error('Active payment status lookup failed');
    return json({ active: true, status: 'unknown', retryAvailable: false }, 503);
  }
}
