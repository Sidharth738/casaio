import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
import type { DocumentReference } from 'firebase-admin/firestore';
import { requireServerUser } from '@/lib/firebase/server-auth';
import type { OrderItem } from '@/types';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef } from '@/lib/payment/attempts';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import { buildCancellationInventoryUpdates } from '@/lib/orders/cancellation-inventory';
import { getCouponUserUsageRefs } from '@/lib/coupons/user-usage';
import {
  markRefundReconciliationRequired,
  reserveCancellationRefundAttempt,
  transitionRefundAttempt,
  type VerifiedRefundEvidence,
} from '@/lib/payment/refund-attempts';

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

type ProviderRefund = {
  id?: unknown;
  payment_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  receipt?: unknown;
  notes?: { orderId?: unknown };
};

function providerEvidence(refund: ProviderRefund): VerifiedRefundEvidence | null {
  if (typeof refund.id !== 'string' || typeof refund.payment_id !== 'string' ||
      !Number.isSafeInteger(refund.amount) || typeof refund.currency !== 'string' ||
      !['pending', 'processed', 'failed'].includes(String(refund.status))) return null;
  return {
    refundId: refund.id,
    paymentId: refund.payment_id,
    amount: refund.amount as number,
    currency: refund.currency,
    status: refund.status as VerifiedRefundEvidence['status'],
    ...(typeof refund.receipt === 'string' ? { receipt: refund.receipt } : {}),
    ...(typeof refund.notes?.orderId === 'string' ? { orderNote: refund.notes.orderId } : {}),
  };
}

function refundResponse(kind: string) {
  if (kind === 'succeeded' || kind === 'already_applied') {
    return NextResponse.json({ success: true, message: 'Order cancelled and refund confirmed.', paymentStatus: 'refunded' });
  }
  if (kind === 'failed') {
    return NextResponse.json({ error: 'Razorpay confirmed that the refund failed. The order remains active; contact support.' }, { status: 409 });
  }
  if (kind === 'reconciliation_required') {
    return NextResponse.json({
      success: false,
      reconciliationRequired: true,
      message: 'Your refund outcome needs review. Do not submit another payment or refund request.',
      paymentStatus: 'captured',
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({
    success: true,
    reconciliationRequired: kind === 'submission_unknown',
    message: kind === 'submission_unknown'
      ? 'Your refund is being checked. Bank and payment-method processing times vary.'
      : 'Your refund is processing. Bank and payment-method processing times vary.',
    paymentStatus: 'refund_pending',
  }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}

async function fetchAllRefunds(razorpay: Razorpay, paymentId: string) {
  const refunds: ProviderRefund[] = [];
  const seenIds = new Set<string>();
  let skip = 0;
  for (let page = 0; page < 100; page++) {
    const response = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100, skip });
    if (!Array.isArray(response.items)) throw new Error('Invalid refund list');
    for (const refund of response.items as ProviderRefund[]) {
      if (typeof refund.id === 'string') {
        if (seenIds.has(refund.id)) throw new Error('Repeated refund page');
        seenIds.add(refund.id);
      }
      refunds.push(refund);
    }
    if (response.items.length < 100) return refunds;
    skip += response.items.length;
  }
  throw new Error('Refund list exceeded the safe pagination limit');
}

async function processOnlineCancellation(orderId: string, customerId: string) {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const preview = await orderRef.get();
  if (!preview.exists || preview.data()?.customerId !== customerId) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  const previewPayment = preview.data()?.payment;
  if (previewPayment?.method !== 'razorpay') return null;

  let configuration;
  try {
    configuration = getRazorpayConfiguration();
  } catch (error: unknown) {
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ error: 'Payment configuration is invalid' }, { status: 503 });
    }
    throw error;
  }
  if (configuration.mode === 'simulation' || previewPayment.razorpayPaymentId?.startsWith('pay_sim_')) {
    return NextResponse.json({ error: 'Simulated payments cannot be refunded through Razorpay.' }, { status: 409 });
  }

  const reservation = await reserveCancellationRefundAttempt(orderId, customerId);
  if (reservation.kind === 'not_found') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (reservation.kind === 'invalid_amount') return NextResponse.json({ error: 'Order amount requires support review.' }, { status: 409 });
  if (reservation.kind === 'ineligible') return NextResponse.json({ error: 'This order is not eligible for cancellation.' }, { status: 409 });
  if (reservation.kind === 'inconsistent' || reservation.kind === 'invalid_request') {
    return NextResponse.json({ error: 'Cancellation requires support review.' }, { status: 409 });
  }
  let attempt = reservation.attempt;
  if (attempt.state === 'succeeded') return refundResponse('succeeded');
  if (attempt.state === 'failed') return refundResponse('failed');
  if (attempt.state === 'provider_identified') {
    const current = (await orderRef.get()).data();
    const storedPayment = current?.payment;
    if (current?.orderStatus === 'cancelled' && current.cancellationStatus === 'completed' &&
        storedPayment?.status === 'refunded' && storedPayment.razorpayRefundId === attempt.providerRefundId) {
      const synchronized = await transitionRefundAttempt(orderId, attempt.id, 'succeeded', {
        paymentId: attempt.paymentId, amount: attempt.amount, currency: attempt.currency,
        refundId: attempt.providerRefundId!, status: 'processed',
      });
      return refundResponse(synchronized.kind === 'transitioned' || synchronized.kind === 'already_applied'
        ? 'succeeded'
        : 'reconciliation_required');
    }
    if (storedPayment?.status === 'refund_failed' && storedPayment.razorpayRefundId === attempt.providerRefundId) {
      const synchronized = await transitionRefundAttempt(orderId, attempt.id, 'failed', {
        paymentId: attempt.paymentId, amount: attempt.amount, currency: attempt.currency,
        refundId: attempt.providerRefundId!, status: 'failed',
      });
      return refundResponse(synchronized.kind === 'transitioned' || synchronized.kind === 'already_applied'
        ? 'failed'
        : 'reconciliation_required');
    }
    return refundResponse('provider_identified');
  }

  const razorpay = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
  try {
    let payment;
    let existingRefunds: ProviderRefund[];
    try {
      payment = await razorpay.payments.fetch(attempt.paymentId);
      existingRefunds = await fetchAllRefunds(razorpay, attempt.paymentId);
    } catch {
      return NextResponse.json({
        error: 'Refund status could not be checked. The cancellation remains pending; contact support before retrying.',
      }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const amountRefunded = payment.amount_refunded;
    if (payment.id !== attempt.paymentId || payment.status !== 'captured' ||
        payment.amount !== attempt.amount || payment.currency !== attempt.currency ||
        !Number.isSafeInteger(amountRefunded) || (amountRefunded as number) > attempt.amount) {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_balance_uncertain');
      return refundResponse('reconciliation_required');
    }

    const matching = existingRefunds.filter((refund) => refund.receipt === attempt.requestBody.receipt);
    const otherNonFailed = existingRefunds.filter((refund) => refund.receipt !== attempt.requestBody.receipt && refund.status !== 'failed');
    if (otherNonFailed.length > 0 || ((amountRefunded as number) > 0 && matching.length === 0)) {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_balance_uncertain');
      return refundResponse('reconciliation_required');
    }
    if (matching.length > 1) {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_balance_uncertain');
      return refundResponse('reconciliation_required');
    }
    if (matching.length === 1) {
      const evidence = providerEvidence(matching[0]);
      if (!evidence || evidence.paymentId !== attempt.paymentId || evidence.amount !== attempt.amount ||
          evidence.currency !== attempt.currency || evidence.receipt !== attempt.requestBody.receipt ||
          (evidence.status === 'processed' && amountRefunded !== attempt.amount) ||
          (evidence.status === 'failed' && amountRefunded !== 0)) {
        await markRefundReconciliationRequired(orderId, attempt.id, 'refund_provider_data_invalid');
        return refundResponse('reconciliation_required');
      }
      if (attempt.state === 'not_submitted') {
        const started = await transitionRefundAttempt(orderId, attempt.id, 'submission_unknown');
        if (started.kind !== 'transitioned' && started.kind !== 'already_applied') return refundResponse('reconciliation_required');
        attempt = started.attempt;
      }
      const state = evidence.status === 'pending' ? 'provider_identified' : evidence.status === 'processed' ? 'succeeded' : 'failed';
      const applied = await transitionRefundAttempt(orderId, attempt.id, state, evidence);
      return refundResponse(applied.kind === 'transitioned' || applied.kind === 'already_applied'
        ? applied.attempt.state
        : 'reconciliation_required');
    }
    if (amountRefunded !== 0 || existingRefunds.some((refund) => refund.status !== 'failed')) {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_balance_uncertain');
      return refundResponse('reconciliation_required');
    }

    if (attempt.state === 'not_submitted') {
      const started = await transitionRefundAttempt(orderId, attempt.id, 'submission_unknown');
      if (started.kind !== 'transitioned' && started.kind !== 'already_applied') return refundResponse('reconciliation_required');
      attempt = started.attempt;
    }

    // Razorpay SDK 2.9.8 drops custom headers in payments.refund(). Its installed
    // Axios adapter preserves auth/base URL and supports per-request headers.
    const rawApi = razorpay.api as unknown as {
      rq: { post: (url: string, body: string, options: { headers: Record<string, string> }) => Promise<{ data: ProviderRefund }> };
    };
    let response: { data: ProviderRefund };
    try {
      response = await rawApi.rq.post(
        `/v1/payments/${encodeURIComponent(attempt.paymentId)}/refund`,
        attempt.requestBodyJson,
        { headers: { 'Content-Type': 'application/json', 'X-Refund-Idempotency': attempt.idempotencyKey } },
      );
    } catch {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_submission_unknown');
      return refundResponse('submission_unknown');
    }
    const evidence = providerEvidence(response.data);
    if (!evidence || evidence.paymentId !== attempt.paymentId || evidence.amount !== attempt.amount ||
        evidence.currency !== attempt.currency) {
      await markRefundReconciliationRequired(orderId, attempt.id, 'refund_provider_data_invalid');
      return refundResponse('reconciliation_required');
    }
    const state = evidence.status === 'pending' ? 'provider_identified' : evidence.status === 'processed' ? 'succeeded' : 'failed';
    const applied = await transitionRefundAttempt(orderId, attempt.id, state, evidence);
    return refundResponse(applied.kind === 'transitioned' || applied.kind === 'already_applied'
      ? applied.attempt.state
      : 'reconciliation_required');
  } catch {
    return NextResponse.json({ error: 'Refund reconciliation could not be completed. Contact support.' }, { status: 503 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await requireServerUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { orderId } = await params;
    const onlineResult = await processOnlineCancellation(orderId, user.uid);
    if (onlineResult) return onlineResult;
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

    const now = new Date().toISOString();
    try {
      const completion = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists) throw new Error('Order not found while completing cancellation');
        const current = snapshot.data()!;
        if (current.cancellationStatus !== 'processing') {
          throw new Error('Order cancellation state changed');
        }

        let releaseCouponReservation: DocumentReference | null = null;
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
          throw new Error(inventoryRestoration.error);
        }
        for (const [productId, updates] of inventoryRestoration.updates) {
          transaction.update(adminDb.collection('products').doc(productId), updates);
        }

        transaction.update(orderRef, {
          orderStatus: 'cancelled',
          items: items.map((item) => ({ ...item, fulfillmentStatus: 'cancelled' })),
          cancellationStatus: 'completed',
          statusTimeline: [
            ...(current.statusTimeline || []),
            {
              status: 'cancelled',
              timestamp: now,
              note: 'Order cancelled by the customer.',
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
        return { failed: false as const, pending: false as const };
      });
      if (completion.failed) {
        return NextResponse.json({ error: 'Order cancellation could not be completed.' }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        message: 'Order cancelled successfully.',
        paymentStatus: 'pending',
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
