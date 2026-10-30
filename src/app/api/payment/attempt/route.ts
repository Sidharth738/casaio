import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import Razorpay from 'razorpay';
import { FieldValue, type Transaction, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerUser } from '@/lib/firebase/server-auth';
import {
  canRetryExistingOrder,
  configureRazorpayTimeout,
  getCaptureReconciliationReason,
  getActivePaymentAttemptRef,
} from '@/lib/payment/attempts';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { rupeesToPaise } from '@/lib/orders/money';
import { stageOnlineReservationConsumed } from '@/lib/coupons/user-usage';

export const runtime = 'nodejs';

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

type RecoverablePaymentOrder = {
  customerId?: unknown;
  payment?: {
    method?: unknown;
    status?: unknown;
    reconciliationRequired?: unknown;
    failureFinalizedAt?: unknown;
  };
  orderStatus?: unknown;
  cancellationStatus?: unknown;
};

function isUnresolvedPaymentOrder(order: RecoverablePaymentOrder | undefined, userId: string) {
  if (!order || order.customerId !== userId || order.payment?.method !== 'razorpay') return false;
  const status = order.payment?.status;
  const wasCancelled = order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed';
  return status === 'pending' || status === 'authorized' ||
    (status === 'captured' && (Boolean(order.payment?.reconciliationRequired) || wasCancelled)) ||
    (status === 'failed' && (Boolean(order.payment?.failureFinalizedAt) || wasCancelled));
}

export async function GET(request: NextRequest) {
  const correlationId = randomUUID();
  let failureCategory = 'unexpected_internal_error';
  try {
    const user = await requireServerUser(request);
    if (!user) return json({ error: 'Authentication required' }, 401);

    const lockRef = getActivePaymentAttemptRef(user.uid);
    failureCategory = 'firestore_read_failure';
    const lockSnap = await lockRef.get();
    let lock = lockSnap.data();

    // The lock is a coordination pointer, not the source of truth. A capture
    // webhook or verification can remove it, so recover unresolved orders from
    // this authenticated customer's own order history before reporting idle.
    if (!lockSnap.exists) {
      const ownedOrders = await adminDb.collection('orders')
        .where('customerId', '==', user.uid)
        .get();
      const candidates = ownedOrders.docs.filter((document: QueryDocumentSnapshot) =>
        isUnresolvedPaymentOrder(document.data(), user.uid)
      );

      if (candidates.length === 0) return json({ active: false });
      if (candidates.length !== 1) {
        return json({ active: true, status: 'unknown', retryAvailable: false });
      }

      const candidate = candidates[0];
      failureCategory = 'firestore_transaction_failure';
      const claim = await adminDb.runTransaction(async (transaction: Transaction) => {
        const [currentLockSnap, currentOrderSnap] = await Promise.all([
          transaction.get(lockRef),
          transaction.get(candidate.ref),
        ]);
        const currentOrder = currentOrderSnap.data();
        if (!currentOrderSnap.exists || currentOrder?.customerId !== user.uid || currentOrder.payment?.method !== 'razorpay') {
          return 'changed';
        }
        // A concurrent verifier/webhook may have completed this order after
        // discovery. Preserve that persisted result instead of returning an
        // unknown state just because its active pointer was removed.
        if (currentOrder.payment?.status === 'captured') return candidate.id;
        if (!isUnresolvedPaymentOrder(currentOrder, user.uid)) return 'changed';
        if (currentLockSnap.exists) {
          return currentLockSnap.data()?.userId === user.uid &&
            typeof currentLockSnap.data()?.orderId === 'string'
            ? currentLockSnap.data()!.orderId as string
            : 'invalid-lock';
        }
        transaction.set(lockRef, {
          userId: user.uid,
          orderId: candidate.id,
          orderNumber: currentOrder.orderNumber,
          createdAt: currentOrder.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return candidate.id;
      });
      failureCategory = 'unexpected_internal_error';

      if (claim === 'invalid-lock' || claim === 'changed') {
        return json({ active: true, status: 'unknown', retryAvailable: false });
      }

      const recoveredOrderId = claim;
      // Keep the transaction's result locally. A concurrent capture can delete
      // the pointer immediately after the claim commits; rereading it here
      // would turn a successfully recovered order back into an unknown result.
      lock = { userId: user.uid, orderId: recoveredOrderId };
    }

    if (!lock) return json({ active: true, status: 'unknown', retryAvailable: false });
    if (lock.userId !== user.uid || typeof lock.orderId !== 'string') {
      return json({ active: true, status: 'unknown', retryAvailable: false });
    }

    const orderRef = adminDb.collection('orders').doc(lock.orderId);
    const orderSnap = await orderRef.get();
    failureCategory = 'unexpected_internal_error';
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
      failureCategory = 'firestore_transaction_failure';
      await adminDb.runTransaction(async (transaction: Transaction) => {
        const [currentOrderSnap, currentLockSnap] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(lockRef),
        ]);
        if (currentOrderSnap.data()?.payment?.status === 'captured' &&
            currentOrderSnap.data()?.payment?.razorpayPaymentId === order.payment.razorpayPaymentId &&
            currentLockSnap.data()?.orderId === lock.orderId) {
          await stageOnlineReservationConsumed(
            transaction, adminDb, currentOrderSnap.data(), orderRef.id, new Date().toISOString()
          );
          transaction.delete(lockRef);
        }
      });
      failureCategory = 'unexpected_internal_error';
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
    failureCategory = 'razorpay_configuration_failure';
    const configuration = getRazorpayConfiguration();
    failureCategory = 'unexpected_internal_error';
    if (!razorpayOrderId) {
      return activeReply('pending', Boolean(razorpayOrderId));
    }
    if (razorpayOrderId.startsWith('order_sim_')) {
      return configuration.mode === 'simulation'
        ? activeReply('pending', true)
        : activeReply('unknown');
    }
    if (configuration.mode === 'simulation') {
      return activeReply('unknown');
    }

    failureCategory = 'razorpay_provider_failure';
    const razorpay = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
    configureRazorpayTimeout(razorpay);
    const [providerOrder, paymentList] = await Promise.all([
      razorpay.orders.fetch(razorpayOrderId),
      razorpay.orders.fetchPayments(razorpayOrderId),
    ]);
    failureCategory = 'invalid_stored_or_provider_data';
    const expectedAmount = rupeesToPaise(Number(order.pricing?.totalAmount || 0));
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
      failureCategory = 'firestore_transaction_failure';
      const result = await adminDb.runTransaction(async (transaction: Transaction) => {
        const [currentOrderSnap, currentLockSnap] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(lockRef),
        ]);
        const currentOrder = currentOrderSnap.data();
        if (!currentOrder || currentOrder.customerId !== user.uid ||
            currentOrder.payment?.method !== 'razorpay' ||
            currentOrder.payment?.razorpayOrderId !== razorpayOrderId) return 'conflict';
        if (currentOrder.payment?.status === 'captured') {
          await stageOnlineReservationConsumed(transaction, adminDb, currentOrder, orderRef.id, now);
          if (currentOrder.payment?.razorpayPaymentId === captured.id) {
            if (currentLockSnap.data()?.orderId === lock.orderId) transaction.delete(lockRef);
            return 'already-captured';
          }
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'additional_captured_payment_id',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(captured.id),
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        if (currentLockSnap.data()?.orderId !== lock.orderId) return 'conflict';
        const currentNeedsReconciliation = currentOrder.payment?.status === 'failed' || Boolean(currentOrder.payment?.failureFinalizedAt) ||
          currentOrder.orderStatus === 'cancelled' || currentOrder.cancellationStatus === 'completed';
        if (currentOrder.payment?.status !== 'pending' && currentOrder.payment?.status !== 'authorized' && !currentNeedsReconciliation) return 'conflict';
        const reconciliationReason = getCaptureReconciliationReason(currentOrder, captured.id);
        const reconciliationRequired = currentNeedsReconciliation || Boolean(reconciliationReason) || otherAuthorizedIds.length > 0;
        await stageOnlineReservationConsumed(transaction, adminDb, currentOrder, orderRef.id, now);
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
      failureCategory = 'unexpected_internal_error';
      return activeReply(result === 'conflict' ? 'unknown' : 'captured');
    }

    const authorizedPayments = paymentList.items.filter((payment) =>
      payment.id && payment.order_id === razorpayOrderId && payment.status === 'authorized' &&
      payment.amount === expectedAmount && payment.currency === 'INR'
    );
    const hasAuthorized = authorizedPayments.length > 0;
    const hasUnfinished = paymentList.items.some((payment) => payment.status === 'created');
    failureCategory = 'unexpected_internal_error';
    if (hasAuthorized) {
      const authorizedIds = authorizedPayments.map((payment) => payment.id).filter((id): id is string => Boolean(id));
      failureCategory = 'firestore_transaction_failure';
      await adminDb.runTransaction(async (transaction: Transaction) => {
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
      failureCategory = 'unexpected_internal_error';
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
    console.error('payment_attempt_lookup_failed', { correlationId, category: failureCategory });
    return json({
      active: true,
      status: 'unknown',
      retryAvailable: false,
      error: 'Payment status is temporarily unavailable. Do not pay again until it is confirmed.',
      correlationId,
    }, 503);
  }
}
