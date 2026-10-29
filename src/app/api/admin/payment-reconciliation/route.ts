import { randomUUID } from 'node:crypto';
import Razorpay from 'razorpay';
import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { adminDb } from '@/lib/firebase/admin';
import { getRazorpayConfiguration } from '@/lib/payment/razorpay-config';
import { RazorpayConfigurationError } from '@/lib/payment/razorpay-config-core';
import type { RefundAttempt } from '@/types/order';
import {
  getRefundAttemptRef,
  isRefundAttempt,
  recordRefundReconciliationAction,
  transitionRefundAttempt,
  type RefundOperatorAudit,
  type VerifiedRefundEvidence,
} from '@/lib/payment/refund-attempts';

type ProviderRefund = {
  id?: unknown;
  payment_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  receipt?: unknown;
  notes?: { orderId?: unknown };
};

type ProviderPayment = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  amount_refunded?: unknown;
  currency?: unknown;
};

type ReconciliationCase = ReturnType<typeof safeAttempt> & {
  orderId: string;
  orderNumber?: string;
  diagnosticCategory: string;
};

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 150 && !value.includes('/');
}

const SAFE_DIAGNOSTIC_CATEGORIES = new Set([
  'refund_submission_unknown', 'refund_balance_uncertain', 'refund_provider_data_invalid',
  'refund_provider_status_unknown', 'provider_refund_not_found', 'provider_refund_ambiguous',
  'provider_evidence_mismatch', 'attempt_submission_state_unresolved', 'persisted_attempt_mismatch',
  'terminal_state_conflict', 'firestore_transaction_failure', 'razorpay_provider_failure',
  'razorpay_configuration_failure', 'simulation_not_supported', 'cancellation_inventory_restore_failed',
  'provider_evidence_rejected',
]);

function safeDiagnosticCategory(value: unknown): string {
  return typeof value === 'string' && SAFE_DIAGNOSTIC_CATEGORIES.has(value)
    ? value
    : 'manual_review_required';
}

function maskedReference(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return `••••${value.slice(-4)}`;
}

function safeAttempt(attempt: RefundAttempt, includeOrderId = false) {
  return {
    id: attempt.id,
    ...(includeOrderId ? { orderId: attempt.orderId } : {}),
    amount: attempt.amount,
    currency: attempt.currency,
    state: attempt.state,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    submissionStartedAt: attempt.submissionStartedAt,
    providerRefundReference: maskedReference(attempt.providerRefundId),
    providerStatus: attempt.providerStatus,
    providerVerifiedAt: attempt.providerVerifiedAt,
  };
}

function safeAudit(documentId: string, value: Record<string, unknown>) {
  return {
    id: documentId,
    action: typeof value.action === 'string' ? value.action : 'reconciliation',
    outcome: typeof value.outcome === 'string' ? value.outcome : 'recorded',
    diagnosticCategory: safeDiagnosticCategory(value.diagnosticCategory),
    providerStatus: typeof value.providerStatus === 'string' && ['pending', 'processed', 'failed'].includes(value.providerStatus)
      ? value.providerStatus
      : undefined,
    actorReference: maskedReference(value.actorUid),
    createdAt: value.createdAt,
  };
}

function auditError(correlationId: string, category: string) {
  console.error('Admin refund reconciliation failed', { correlationId, category });
}

async function fetchAllRefunds(razorpay: Razorpay, paymentId: string): Promise<ProviderRefund[]> {
  const refunds: ProviderRefund[] = [];
  const seen = new Set<string>();
  let skip = 0;
  for (let page = 0; page < 100; page++) {
    const response = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 100, skip });
    if (!Array.isArray(response.items)) throw new Error('invalid_refund_page');
    for (const value of response.items as ProviderRefund[]) {
      if (typeof value.id === 'string') {
        if (seen.has(value.id)) throw new Error('duplicate_refund_page');
        seen.add(value.id);
      }
      refunds.push(value);
    }
    if (response.items.length < 100) return refunds;
    skip += response.items.length;
  }
  throw new Error('refund_page_limit');
}

function toEvidence(refund: ProviderRefund, orderId: string): VerifiedRefundEvidence | null {
  if (typeof refund.id !== 'string' || typeof refund.payment_id !== 'string' ||
      !Number.isSafeInteger(refund.amount) || typeof refund.currency !== 'string' ||
      !['pending', 'processed', 'failed'].includes(String(refund.status))) return null;
  return {
    orderId,
    paymentId: refund.payment_id,
    amount: refund.amount as number,
    currency: refund.currency,
    refundId: refund.id,
    status: refund.status as VerifiedRefundEvidence['status'],
    ...(typeof refund.receipt === 'string' ? { receipt: refund.receipt } : {}),
    ...(typeof refund.notes?.orderId === 'string' ? { orderNote: refund.notes.orderId } : {}),
  };
}

async function recordOutcome(
  orderId: string,
  attemptId: string,
  audit: RefundOperatorAudit,
  unresolved = false,
) {
  return recordRefundReconciliationAction(orderId, attemptId, audit, unresolved);
}

export async function GET(request: NextRequest) {
  const admin = await requireServerRole(request, ['admin']);
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });

  try {
    const orderId = request.nextUrl.searchParams.get('refundOrderId');
    if (orderId) {
      if (!isId(orderId)) return NextResponse.json({ error: 'Invalid order identifier' }, { status: 400 });
      const orderRef = adminDb.collection('orders').doc(orderId);
      const [orderSnapshot, attemptsSnapshot, auditsSnapshot] = await Promise.all([
        orderRef.get(), orderRef.collection('refundAttempts').get(),
        orderRef.collection('refundReconciliationAudit').orderBy('createdAt', 'desc').limit(50).get(),
      ]);
      if (!orderSnapshot.exists) return NextResponse.json({ error: 'Reconciliation case not found' }, { status: 404 });
      const order = orderSnapshot.data() || {};
      return NextResponse.json({
        case: {
          orderId,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          cancellationStatus: order.cancellationStatus || 'none',
          payment: {
            method: order.payment?.method,
            status: order.payment?.status,
            paymentReference: maskedReference(order.payment?.razorpayPaymentId),
            refundReference: maskedReference(order.payment?.razorpayRefundId),
            reconciliationRequired: order.payment?.reconciliationRequired === true,
            diagnosticCategory: safeDiagnosticCategory(order.payment?.reconciliationReason),
          },
          attempts: attemptsSnapshot.docs.map((document: QueryDocumentSnapshot) => {
            const attempt = document.data();
            return isRefundAttempt(attempt) ? safeAttempt(attempt) : { id: document.id, state: 'invalid_record' };
          }),
          history: auditsSnapshot.docs.map((document: QueryDocumentSnapshot) => safeAudit(document.id, document.data())),
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (request.nextUrl.searchParams.get('refunds') === 'true') {
      const snapshot = await adminDb.collectionGroup('refundAttempts')
        .where('state', 'in', ['not_submitted', 'submission_unknown', 'provider_identified', 'failed', 'succeeded'])
        .limit(100)
        .get();
      const cases: Array<ReconciliationCase | null> = await Promise.all(snapshot.docs.map(async (document: QueryDocumentSnapshot) => {
        const attempt = document.data();
        if (!isRefundAttempt(attempt)) return null;
        const parentOrderRef = document.ref.parent.parent;
        const parentOrder = parentOrderRef ? (await parentOrderRef.get()).data() : undefined;
        if (attempt.state === 'succeeded' && parentOrder?.payment?.reconciliationRequired !== true) return null;
        return {
          ...safeAttempt(attempt, true),
          orderId: parentOrderRef?.id || attempt.orderId,
          orderNumber: typeof parentOrder?.orderNumber === 'string' ? parentOrder.orderNumber : parentOrderRef?.id,
          diagnosticCategory: safeDiagnosticCategory(parentOrder?.payment?.reconciliationReason || attempt.state),
        };
      }));
      return NextResponse.json({
        refunds: cases.filter((item): item is ReconciliationCase => item !== null),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const snapshot = await adminDb.collection('orders')
      .where('payment.reconciliationRequired', '==', true)
      .limit(100)
      .get();

    return NextResponse.json({
      cases: snapshot.docs.map((document: QueryDocumentSnapshot) => {
        const order = document.data();
        return {
          orderId: document.id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          payment: {
            method: order.payment?.method,
            status: order.payment?.status,
            razorpayOrderId: order.payment?.razorpayOrderId,
            razorpayPaymentId: order.payment?.razorpayPaymentId,
            razorpayAuthorizedPaymentId: order.payment?.razorpayAuthorizedPaymentId,
            reconciliationReason: order.payment?.reconciliationReason,
            reconciliationPaymentIds: order.payment?.reconciliationPaymentIds || [],
            reconciliationStatus: order.payment?.reconciliationStatus || 'open',
          },
          items: Array.isArray(order.items)
            ? order.items.map((item: { productId?: string; title?: string; quantity?: number; fulfillmentStatus?: string }) => ({
                productId: item.productId,
                title: item.title,
                quantity: item.quantity,
                fulfillmentStatus: item.fulfillmentStatus,
              }))
            : [],
          updatedAt: order.updatedAt,
        };
      }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    const correlationId = randomUUID();
    auditError(correlationId, 'firestore_read_failure');
    return NextResponse.json({ error: 'Unable to load payment reconciliation cases', correlationId }, { status: 500 });
  }
}

/** Reconcile only provider state. This endpoint never submits or retries a refund. */
export async function POST(request: NextRequest) {
  const admin = await requireServerRole(request, ['admin']);
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });

  const correlationId = randomUUID();
  let body: { orderId?: unknown; attemptId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid reconciliation request', correlationId }, { status: 400 });
  }
  const orderId = body.orderId;
  const attemptId = body.attemptId;
  const actionId = request.headers.get('idempotency-key') || '';
  if (!isId(orderId) || !isId(attemptId) || !/^[A-Za-z0-9_-]{16,80}$/.test(actionId)) {
    return NextResponse.json({ error: 'Order, attempt, and Idempotency-Key are required', correlationId }, { status: 400 });
  }

  const auditBase: Omit<RefundOperatorAudit, 'outcome'> = { actorUid: admin.uid, actionId };
  const orderRef = adminDb.collection('orders').doc(orderId);
  try {
    const [orderSnapshot, attemptSnapshot] = await Promise.all([
      orderRef.get(), getRefundAttemptRef(adminDb, orderId, attemptId).get(),
    ]);
    const order = orderSnapshot.data();
    const attempt = attemptSnapshot.data();
    if (!orderSnapshot.exists || !attemptSnapshot.exists || !order || !isRefundAttempt(attempt) ||
        attempt.id !== attemptId || attempt.orderId !== orderId || attempt.customerId !== order.customerId ||
        attempt.paymentId !== order.payment?.razorpayPaymentId ||
        order.payment?.activeRefundAttemptId !== attemptId || order.payment?.method !== 'razorpay') {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'attempt_mapping_unresolved', diagnosticCategory: 'persisted_attempt_mismatch' }, true);
      return NextResponse.json({ status: 'unknown', message: 'The refund attempt mapping requires manual review.', correlationId }, { status: 409 });
    }
    if (order.payment?.razorpayRefundId && attempt.providerRefundId && order.payment.razorpayRefundId !== attempt.providerRefundId) {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'refund_id_mismatch', diagnosticCategory: 'persisted_attempt_mismatch' }, true);
      return NextResponse.json({ status: 'unknown', message: 'The refund identifiers require manual review.', correlationId }, { status: 409 });
    }

    let configuration;
    try {
      configuration = getRazorpayConfiguration();
    } catch (error) {
      const category = error instanceof RazorpayConfigurationError ? 'razorpay_configuration_failure' : 'internal_error';
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'provider_unavailable', diagnosticCategory: category }, true);
      auditError(correlationId, category);
      return NextResponse.json({ status: 'unknown', message: 'Provider status could not be verified.', correlationId }, { status: 503 });
    }
    if (configuration.mode === 'simulation') {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'provider_unavailable', diagnosticCategory: 'simulation_not_supported' }, true);
      return NextResponse.json({ status: 'unknown', message: 'Provider status could not be verified.', correlationId }, { status: 503 });
    }

    let payment: ProviderPayment;
    let refunds: ProviderRefund[];
    try {
      const razorpay = new Razorpay({ key_id: configuration.keyId, key_secret: configuration.keySecret });
      const [providerPayment, providerRefunds] = await Promise.all([
        razorpay.payments.fetch(attempt.paymentId), fetchAllRefunds(razorpay, attempt.paymentId),
      ]);
      payment = providerPayment as unknown as ProviderPayment;
      refunds = providerRefunds;
    } catch {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'provider_unavailable', diagnosticCategory: 'razorpay_provider_failure' }, true);
      auditError(correlationId, 'razorpay_provider_failure');
      return NextResponse.json({ status: 'unknown', message: 'Provider status could not be verified.', correlationId }, { status: 503 });
    }

    if (payment.id !== attempt.paymentId || payment.status !== 'captured' || payment.amount !== attempt.amount ||
        payment.currency !== attempt.currency || !Number.isSafeInteger(payment.amount_refunded) ||
        (payment.amount_refunded as number) < 0 || (payment.amount_refunded as number) > attempt.amount) {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'provider_payment_mismatch', diagnosticCategory: 'provider_evidence_mismatch' }, true);
      auditError(correlationId, 'provider_evidence_mismatch');
      return NextResponse.json({ status: 'unknown', message: 'Provider evidence does not match this refund attempt.', correlationId }, { status: 409 });
    }

    const candidates = refunds.filter((refund) => {
      if (attempt.providerRefundId) return refund.id === attempt.providerRefundId;
      return refund.payment_id === attempt.paymentId && refund.receipt === attempt.requestBody.receipt &&
        refund.notes?.orderId === orderId;
    });
    if (candidates.length !== 1) {
      const category = candidates.length === 0 ? 'provider_refund_not_found' : 'provider_refund_ambiguous';
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'provider_status_unknown', diagnosticCategory: category }, true);
      return NextResponse.json({ status: 'unknown', message: 'No unique provider refund could be verified. No new refund was submitted.', correlationId }, { status: 202 });
    }

    const evidence = toEvidence(candidates[0], orderId);
    const otherActiveRefunds = refunds.filter((refund) => refund.id !== candidates[0].id && refund.status !== 'failed');
    const amountRefunded = payment.amount_refunded as number;
    const amountConsistent = evidence?.status === 'processed'
      ? amountRefunded === attempt.amount
      : evidence?.status === 'failed'
        ? amountRefunded === 0
        : evidence?.status === 'pending' && amountRefunded === 0;
    const identityConsistent = evidence && evidence.paymentId === attempt.paymentId && evidence.amount === attempt.amount &&
      evidence.currency === attempt.currency && evidence.refundId === candidates[0].id &&
      (!attempt.providerRefundId || evidence.refundId === attempt.providerRefundId) &&
      (!evidence.receipt || evidence.receipt === attempt.requestBody.receipt) &&
      (!evidence.orderNote || evidence.orderNote === orderId) &&
      (Boolean(attempt.providerRefundId) || (evidence.receipt === attempt.requestBody.receipt && evidence.orderNote === orderId));

    if (!evidence || !identityConsistent || !amountConsistent || otherActiveRefunds.length > 0 || attempt.state === 'not_submitted') {
      await recordOutcome(orderId, attemptId, {
        ...auditBase,
        outcome: 'provider_evidence_unresolved',
        diagnosticCategory: !evidence || !identityConsistent || !amountConsistent || otherActiveRefunds.length > 0
          ? 'provider_evidence_mismatch'
          : 'attempt_submission_state_unresolved',
        ...(evidence ? { providerStatus: evidence.status } : {}),
      }, true);
      return NextResponse.json({ status: 'unknown', message: 'Provider evidence requires manual review.', correlationId }, { status: 409 });
    }

    const nextState = evidence.status === 'processed' ? 'succeeded'
      : evidence.status === 'failed' ? 'failed' : 'provider_identified';
    const result = await transitionRefundAttempt(orderId, attemptId, nextState, evidence, adminDb, {
      ...auditBase,
      outcome: `provider_${evidence.status}`,
      providerStatus: evidence.status,
    });
    if (result.kind === 'duplicate_action') return NextResponse.json({ status: 'duplicate_action' }, { headers: { 'Cache-Control': 'no-store' } });
    if (result.kind === 'transitioned' || result.kind === 'already_applied' || result.kind === 'reconciliation_required') {
      return NextResponse.json({
        status: result.kind === 'reconciliation_required' ? 'reconciliation_required' : evidence.status,
        attemptState: result.attempt.state,
        correlationId,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await recordOutcome(orderId, attemptId, {
      ...auditBase,
      outcome: result.kind,
      diagnosticCategory: result.kind === 'invalid_transition' ? 'terminal_state_conflict' : 'provider_evidence_rejected',
      providerStatus: evidence.status,
    }, true);
    return NextResponse.json({ status: 'unknown', message: 'Refund state requires manual review.', correlationId }, { status: 409 });
  } catch {
    auditError(correlationId, 'firestore_transaction_failure');
    try {
      await recordOutcome(orderId, attemptId, { ...auditBase, outcome: 'reconciliation_failed', diagnosticCategory: 'firestore_transaction_failure' }, true);
    } catch {
      auditError(correlationId, 'audit_write_failure');
    }
    return NextResponse.json({ status: 'unknown', message: 'Refund state could not be reconciled.', correlationId }, { status: 500 });
  }
}
