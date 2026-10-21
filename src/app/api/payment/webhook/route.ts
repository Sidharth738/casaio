import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getCaptureReconciliationReason } from '@/lib/payment/attempt-state';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef } from '@/lib/payment/attempts';
import { getRazorpayWebhookConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import { rupeesToPaise } from '@/lib/orders/money';
import { buildCancellationInventoryUpdates } from '@/lib/orders/cancellation-inventory';
import type { OrderItem } from '@/types';
import { stageOnlineReservationConsumed } from '@/lib/coupons/user-usage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let secret: string;
  try {
    secret = getRazorpayWebhookConfiguration().secret;
  } catch (error: unknown) {
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ error: 'Payment webhook configuration is invalid' }, { status: 503 });
    }
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
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; error_description?: string } };
        refund?: { entity?: { id?: string; payment_id?: string; status?: string } };
      };
    };

    const refund = event.payload?.refund?.entity;
    if (event.event === 'refund.processed' || event.event === 'refund.failed') {
      const expectedRefundStatus = event.event === 'refund.processed' ? 'processed' : 'failed';
      if (!refund?.id || !refund.payment_id || refund.status !== expectedRefundStatus) {
        return NextResponse.json({ error: 'Refund status does not match the event' }, { status: 400 });
      }

      const matchingOrders = await adminDb.collection('orders')
        .where('payment.razorpayPaymentId', '==', refund.payment_id)
        .limit(1)
        .get();
      const order = matchingOrders.docs[0];
      if (!order) return NextResponse.json({ received: true });

      const now = new Date().toISOString();
      const refundResult = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(order.ref);
        const current = snapshot.data();
        if (!snapshot.exists || !current || current.payment?.method !== 'razorpay' ||
            current.payment?.razorpayPaymentId !== refund.payment_id) return 'mismatch';

        const currentRefundId = current.payment?.razorpayRefundId;
        if (!currentRefundId) {
          // Refund events can arrive before the cancellation request persists the
          // provider's refund ID. Ask Razorpay to retry after that transaction.
          return current.cancellationStatus === 'processing' ? 'retry' : 'ignored';
        }
        if (currentRefundId !== refund.id) return 'ignored';

        const currentStatus = current.payment?.status;
        if (event.event === 'refund.processed') {
          if (currentStatus === 'refunded') return 'duplicate';
          if (currentStatus !== 'captured' && currentStatus !== 'refund_pending' && currentStatus !== 'refund_failed') return 'ignored';

          if (current.cancellationStatus === 'processing') {
            const items = Array.isArray(current.items) ? current.items as OrderItem[] : [];
            const uniqueProductIds = Array.from(new Set(items.map((item) => item.productId)));
            const productRefs = uniqueProductIds.map((productId) => adminDb.collection('products').doc(productId));
            const [productSnapshots, activeAttemptSnap, checkoutCoordinationSnap] = await Promise.all([
              Promise.all(productRefs.map((productRef) => transaction.get(productRef))),
              current.customerId ? transaction.get(getActivePaymentAttemptRef(current.customerId)) : Promise.resolve(null),
              current.customerId ? transaction.get(getCheckoutCoordinationRef(current.customerId)) : Promise.resolve(null),
            ]);
            const productData = new Map<string, Record<string, unknown>>();
            for (let index = 0; index < productRefs.length; index++) {
              const productSnapshot = productSnapshots[index];
              if (productSnapshot.exists) productData.set(productRefs[index].id, productSnapshot.data() || {});
            }
            const restoration = buildCancellationInventoryUpdates(items, productData, now);
            if (!restoration.ok || items.length === 0 || items.some((item) => item.fulfillmentStatus !== 'pending')) {
              transaction.update(order.ref, {
                'payment.status': 'refunded',
                cancellationStatus: 'failed',
                'payment.reconciliationRequired': true,
                'payment.reconciliationStatus': 'open',
                'payment.reconciliationReason': 'cancellation_inventory_restore_failed',
                updatedAt: now,
              });
              return 'inventory-conflict';
            }

            for (const [productId, updates] of restoration.updates) {
              transaction.update(adminDb.collection('products').doc(productId), updates);
            }
            transaction.update(order.ref, {
              'payment.status': 'refunded',
              orderStatus: 'cancelled',
              items: items.map((item) => ({ ...item, fulfillmentStatus: 'cancelled' })),
              cancellationStatus: 'completed',
              statusTimeline: [
                ...(current.statusTimeline || []),
                {
                  status: 'cancelled',
                  timestamp: now,
                  note: 'Order cancelled after Razorpay confirmed the refund.',
                  updatedBy: 'system',
                },
              ],
              updatedAt: now,
            });
            const activeAttemptRef = current.customerId ? getActivePaymentAttemptRef(current.customerId) : null;
            if (activeAttemptRef && activeAttemptSnap?.exists && activeAttemptSnap.data()?.orderId === order.id) {
              transaction.delete(activeAttemptRef);
            }
            const checkoutCoordinationRef = current.customerId ? getCheckoutCoordinationRef(current.customerId) : null;
            if (checkoutCoordinationRef && checkoutCoordinationSnap?.exists && checkoutCoordinationSnap.data()?.orderId === order.id) {
              transaction.delete(checkoutCoordinationRef);
            }
            return 'processed-and-cancelled';
          }

          transaction.update(order.ref, {
            'payment.status': 'refunded',
            updatedAt: now,
          });
          return 'processed';
        }

        // A confirmed refund is terminal for this refund ID. In particular, a
        // late failure delivery cannot downgrade it.
        if (currentStatus === 'refunded' || currentStatus === 'refund_failed') return 'duplicate';
        if (currentStatus !== 'captured' && currentStatus !== 'refund_pending') return 'ignored';
        transaction.update(order.ref, {
          'payment.status': 'refund_failed',
          ...(current.cancellationStatus === 'processing' ? { cancellationStatus: 'failed' } : {}),
          updatedAt: now,
        });
        return 'failed';
      });

      if (refundResult === 'retry') {
        return NextResponse.json({ error: 'Refund is being registered; retry delivery' }, { status: 503 });
      }
      if (refundResult === 'inventory-conflict') {
        return NextResponse.json({ error: 'Refund recorded; cancellation inventory needs reconciliation' }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || !payment.id) return NextResponse.json({ received: true });

    const orders = await adminDb.collection('orders')
      .where('payment.razorpayOrderId', '==', payment.order_id)
      .limit(1)
      .get();
    if (orders.empty) return NextResponse.json({ received: true });

    const orderRef = orders.docs[0].ref;
    const matchedOrder = orders.docs[0].data();
    if (matchedOrder.payment?.method !== 'razorpay' || matchedOrder.payment?.razorpayOrderId !== payment.order_id) {
      return NextResponse.json({ error: 'Payment does not match a Razorpay order' }, { status: 409 });
    }
    if (event.event === 'payment.failed') {
      if (payment.status !== 'failed') return NextResponse.json({ error: 'Payment status does not match the event' }, { status: 400 });
      await orderRef.update({
        'payment.lastFailureAt': new Date().toISOString(),
        'payment.lastFailurePaymentId': payment.id,
        'payment.lastFailureReason': payment.error_description || 'Payment failed',
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ received: true });
    }
    if (event.event === 'payment.authorized') {
      if (payment.status !== 'authorized') return NextResponse.json({ error: 'Payment status does not match the event' }, { status: 400 });
      const now = new Date().toISOString();
      const result = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        const order = snapshot.data();
        if (!snapshot.exists || !order || order.payment?.method !== 'razorpay' || order.payment?.razorpayOrderId !== payment.order_id) return 'missing';
        const expectedAmount = rupeesToPaise(Number(order.pricing?.totalAmount || 0));
        if (payment.amount !== expectedAmount || payment.currency !== 'INR') return 'amount-mismatch';
        if (order.payment?.status === 'captured') {
          if (order.payment?.razorpayPaymentId === payment.id) return 'already-captured';
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'authorization_for_additional_payment_id',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        if (order.payment?.status === 'refunded' || order.payment?.status === 'refund_pending' || order.payment?.status === 'refund_failed') {
          if (order.payment?.razorpayAuthorizedPaymentId === payment.id || order.payment?.razorpayPaymentId === payment.id) return 'already-refunded';
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'authorization_after_refund_state',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        if (order.payment?.status === 'authorized') {
          if (order.payment?.razorpayAuthorizedPaymentId === payment.id) return 'already-authorized';
          transaction.update(orderRef, {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'multiple_authorized_payment_ids',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
            updatedAt: now,
          });
          return 'reconciliation-required';
        }
        const needsReconciliation = order.payment?.status === 'failed' || Boolean(order.payment?.failureFinalizedAt) ||
          order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed';
        if (order.payment?.status !== 'pending' && order.payment?.status !== 'failed' &&
            !(order.payment?.status === 'refunded' || order.payment?.status === 'refund_pending' || order.payment?.status === 'refund_failed') &&
            !needsReconciliation) return 'conflict';
        transaction.update(orderRef, {
          'payment.status': 'authorized',
          'payment.razorpayAuthorizedPaymentId': payment.id,
          'payment.authorizedAt': now,
          ...(needsReconciliation ? {
            'payment.reconciliationRequired': true,
            'payment.reconciliationStatus': 'open',
            'payment.reconciliationReason': 'late_authorization_after_failure_or_cancellation',
            'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
          } : {}),
          updatedAt: now,
        });
        return 'authorized';
      });
      if (result === 'amount-mismatch') return NextResponse.json({ error: 'Authorized amount does not match the order' }, { status: 400 });
      if (result === 'conflict') return NextResponse.json({ error: 'Order payment state conflicts with this event' }, { status: 409 });
      return NextResponse.json({ received: true, result });
    }
    if (event.event !== 'payment.captured') return NextResponse.json({ received: true });
    if (payment.status !== 'captured') return NextResponse.json({ error: 'Payment status does not match the event' }, { status: 400 });

    const now = new Date().toISOString();
    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const order = snapshot.data();
      const activeAttemptRef = order?.customerId ? getActivePaymentAttemptRef(order.customerId) : null;
      const activeAttemptSnap = activeAttemptRef ? await transaction.get(activeAttemptRef) : null;
      if (!snapshot.exists || !order || order.payment?.method !== 'razorpay') return 'missing';
      if (order.payment?.razorpayOrderId !== payment.order_id) return 'conflict';
      const expectedAmount = rupeesToPaise(Number(order.pricing?.totalAmount || 0));
      if (payment.amount !== expectedAmount || payment.currency !== 'INR') return 'amount-mismatch';
      if (order.payment?.status === 'refunded' || order.payment?.status === 'refund_pending' || order.payment?.status === 'refund_failed') {
        await stageOnlineReservationConsumed(transaction, adminDb, order, orderRef.id, now);
        if (order.payment?.razorpayPaymentId === payment.id) return 'already-refunded';
        transaction.update(orderRef, {
          'payment.reconciliationRequired': true,
          'payment.reconciliationStatus': 'open',
          'payment.reconciliationReason': 'additional_capture_after_refund_state',
          'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
          updatedAt: now,
        });
        return 'reconciliation-required';
      }
      if (order.payment?.status === 'captured') {
        await stageOnlineReservationConsumed(transaction, adminDb, order, orderRef.id, now);
        if (order.payment?.razorpayPaymentId === payment.id) return 'already-paid';
        transaction.update(orderRef, {
          'payment.reconciliationRequired': true,
          'payment.reconciliationStatus': 'open',
          'payment.reconciliationReason': 'additional_captured_payment_id',
          'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
          updatedAt: now,
        });
        return 'reconciliation-required';
      }
      const orderNeedsReconciliation = order.payment?.status === 'failed' || Boolean(order.payment?.failureFinalizedAt) ||
        order.orderStatus === 'cancelled' || order.cancellationStatus === 'completed';
      if ((order.payment?.status !== 'pending' && order.payment?.status !== 'authorized' && !orderNeedsReconciliation) || order.payment?.razorpayOrderId !== payment.order_id) return 'conflict';
      const reconciliationReason = getCaptureReconciliationReason(order, payment.id!);
      const needsReconciliation = orderNeedsReconciliation || Boolean(reconciliationReason);

      await stageOnlineReservationConsumed(transaction, adminDb, order, orderRef.id, now);

      transaction.update(orderRef, {
        'payment.status': 'captured',
        'payment.razorpayPaymentId': payment.id,
        'payment.paidAt': now,
        ...(needsReconciliation ? {
          'payment.reconciliationRequired': true,
          'payment.reconciliationStatus': 'open',
          'payment.reconciliationReason': reconciliationReason || 'capture_requires_reconciliation',
          'payment.reconciliationPaymentIds': FieldValue.arrayUnion(payment.id),
        } : { orderStatus: 'confirmed' }),
        statusTimeline: [
          ...(order.statusTimeline || []),
          {
            status: needsReconciliation ? 'payment_reconciliation' : 'confirmed',
            timestamp: now,
            note: needsReconciliation
              ? `Razorpay confirmed capture (Payment ID: ${payment.id}); manual order and inventory reconciliation is required.`
              : `Payment captured by Razorpay (Payment ID: ${payment.id}).`,
            updatedBy: 'system',
          },
        ],
        updatedAt: now,
      });
      if (activeAttemptRef && activeAttemptSnap?.exists && activeAttemptSnap.data()?.orderId === orderRef.id) {
        transaction.delete(activeAttemptRef);
      }

      return 'paid';
    });

    if (result === 'amount-mismatch') return NextResponse.json({ error: 'Captured amount does not match the order' }, { status: 400 });
    if (result === 'conflict') return NextResponse.json({ error: 'Order payment state conflicts with this event' }, { status: 409 });
    return NextResponse.json({ received: true, result });
  } catch {
    console.error('Razorpay webhook processing failed');
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
