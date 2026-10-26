import 'server-only';

import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getActivePaymentAttemptRef, getCheckoutCoordinationRef } from '@/lib/payment/attempts';
import { buildCancellationInventoryUpdates } from '@/lib/orders/cancellation-inventory';
import { rupeesToPaise } from '@/lib/orders/money';
import type { OrderItem, RefundAttempt, RefundAttemptState, RefundProviderStatus } from '@/types/order';

/** Fields returned by Razorpay, after the caller has verified the API response or webhook signature. */
export type VerifiedRefundEvidence = {
  orderId?: string;
  paymentId: string;
  amount: number;
  currency: string;
  refundId: string;
  status: RefundProviderStatus;
  receipt?: string;
  orderNote?: string;
};

type RefundDatabase = Pick<Firestore, 'collection' | 'runTransaction'>;

export type RefundOperatorAudit = {
  actorUid: string;
  actionId: string;
  outcome: string;
  diagnosticCategory?: string;
  providerStatus?: string;
};

const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed']);
const ALLOWED_NEXT_STATES: Record<RefundAttemptState, readonly RefundAttemptState[]> = {
  not_submitted: ['submission_unknown'],
  submission_unknown: ['provider_identified', 'succeeded', 'failed'],
  provider_identified: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function getExpectedAmount(order: Record<string, unknown>): number | null {
  const pricing = order.pricing as Record<string, unknown> | undefined;
  if (typeof pricing?.totalAmount !== 'number') return null;
  try {
    const amount = rupeesToPaise(pricing.totalAmount);
    return amount > 0 && Number.isSafeInteger(amount) ? amount : null;
  } catch {
    return null;
  }
}

function getRequestBody(orderId: string, amount: number): RefundAttempt['requestBody'] {
  return {
    amount,
    speed: 'normal' as const,
    receipt: `cancel_${orderId}`,
    notes: { orderId, reason: 'Customer cancellation' },
  };
}

export function isRefundAttemptState(value: unknown): value is RefundAttemptState {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_NEXT_STATES, value);
}

export function isRefundAttempt(value: unknown): value is RefundAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Record<string, unknown>;
  const requestBody = attempt.requestBody as Record<string, unknown> | undefined;
  const serializedRequestBody = requestBody && JSON.stringify({
    amount: requestBody.amount,
    speed: requestBody.speed,
    receipt: requestBody.receipt,
    notes: {
      orderId: (requestBody.notes as Record<string, unknown> | undefined)?.orderId,
      reason: (requestBody.notes as Record<string, unknown> | undefined)?.reason,
    },
  });
  if (!isRefundAttemptState(attempt.state) || !isNonEmptyString(attempt.id) ||
      !isNonEmptyString(attempt.orderId) || !isNonEmptyString(attempt.customerId) ||
      !isNonEmptyString(attempt.paymentId) || !Number.isSafeInteger(attempt.amount) ||
      Number(attempt.amount) <= 0 || attempt.currency !== 'INR' ||
      !isNonEmptyString(attempt.idempotencyKey) || !isNonEmptyString(attempt.requestBodyJson) ||
      !requestBody || requestBody.amount !== attempt.amount || requestBody.speed !== 'normal' ||
      requestBody.receipt !== `cancel_${attempt.orderId}` ||
      serializedRequestBody !== attempt.requestBodyJson ||
      !isNonEmptyString(attempt.createdAt) || !isNonEmptyString(attempt.updatedAt)) return false;
  if (attempt.state === 'not_submitted') {
    return !attempt.submissionStartedAt && !attempt.providerRefundId && !attempt.providerStatus;
  }
  if (!isNonEmptyString(attempt.submissionStartedAt)) return false;
  if (attempt.state === 'submission_unknown') {
    return !attempt.providerRefundId && !attempt.providerStatus && !attempt.providerVerifiedAt;
  }
  if (!isNonEmptyString(attempt.providerRefundId) || !isNonEmptyString(attempt.providerVerifiedAt)) return false;
  if (attempt.state === 'provider_identified') return attempt.providerStatus === 'pending';
  if (attempt.state === 'succeeded') return attempt.providerStatus === 'processed';
  return attempt.state === 'failed' && attempt.providerStatus === 'failed';
}

export function getRefundAttemptRef(db: RefundDatabase, orderId: string, attemptId: string) {
  return db.collection('orders').doc(orderId).collection('refundAttempts').doc(attemptId);
}

export function getRefundReconciliationAuditRef(db: RefundDatabase, orderId: string, actorUid: string, actionId: string) {
  const key = createHash('sha256').update(`${actorUid}\0${actionId}`).digest('hex');
  return db.collection('orders').doc(orderId).collection('refundReconciliationAudit').doc(key);
}

function refundAuditValue(orderId: string, attemptId: string, audit: RefundOperatorAudit) {
  return {
    actorUid: audit.actorUid,
    orderId,
    attemptId,
    actionId: audit.actionId,
    action: 'provider_state_reconciliation',
    outcome: audit.outcome,
    ...(audit.diagnosticCategory ? { diagnosticCategory: audit.diagnosticCategory } : {}),
    ...(audit.providerStatus ? { providerStatus: audit.providerStatus } : {}),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Record an operator decision without applying provider evidence. Unknown results stay open. */
export async function recordRefundReconciliationAction(
  orderId: string,
  attemptId: string,
  audit: RefundOperatorAudit,
  unresolved = false,
  db: RefundDatabase = adminDb,
) {
  const orderRef = db.collection('orders').doc(orderId);
  const attemptRef = getRefundAttemptRef(db, orderId, attemptId);
  const auditRef = getRefundReconciliationAuditRef(db, orderId, audit.actorUid, audit.actionId);
  return db.runTransaction(async (transaction) => {
    const [orderSnapshot, attemptSnapshot, auditSnapshot] = await Promise.all([
      transaction.get(orderRef), transaction.get(attemptRef), transaction.get(auditRef),
    ]);
    if (!orderSnapshot.exists) return { kind: 'not_found' as const };
    if (auditSnapshot.exists) return { kind: 'duplicate_action' as const };
    const now = new Date().toISOString();
    transaction.create(auditRef, refundAuditValue(orderId, attemptId, audit));
    if (unresolved) {
      transaction.update(orderRef, {
        'payment.reconciliationRequired': true,
        'payment.reconciliationStatus': 'open',
        'payment.reconciliationReason': audit.diagnosticCategory || 'refund_provider_status_unknown',
        updatedAt: now,
      });
    }
    return { kind: 'recorded' as const, attemptExists: attemptSnapshot.exists };
  });
}

function stateForProviderStatus(status: RefundProviderStatus): RefundAttemptState {
  if (status === 'pending') return 'provider_identified';
  return status === 'processed' ? 'succeeded' : 'failed';
}

function isValidEvidence(attempt: RefundAttempt, evidence: VerifiedRefundEvidence) {
  return (!evidence.orderId || evidence.orderId === attempt.orderId) && evidence.paymentId === attempt.paymentId &&
    Number.isSafeInteger(evidence.amount) && evidence.amount === attempt.amount &&
    evidence.currency === attempt.currency && isNonEmptyString(evidence.refundId) &&
    ['pending', 'processed', 'failed'].includes(evidence.status) &&
    (!evidence.receipt || evidence.receipt === attempt.requestBody.receipt) &&
    (!evidence.orderNote || evidence.orderNote === attempt.orderId);
}

/** Atomically reserve the cancellation and freeze the one provider request for this order. */
export async function reserveCancellationRefundAttempt(
  orderId: string,
  customerId: string,
  db: RefundDatabase = adminDb,
) {
  if (!orderId || !customerId) return { kind: 'invalid_request' as const };
  const orderRef = db.collection('orders').doc(orderId);
  const attemptsCollection = orderRef.collection('refundAttempts');
  const newAttemptRef = attemptsCollection.doc();
  return db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) return { kind: 'not_found' as const };
    const order = orderSnapshot.data() as Record<string, unknown> | undefined;
    if (!order || order.customerId !== customerId) return { kind: 'not_found' as const };
    const payment = order.payment as Record<string, unknown> | undefined;
    const activeAttemptId = payment?.activeRefundAttemptId;
    if (isNonEmptyString(activeAttemptId)) {
      const activeSnapshot = await transaction.get(attemptsCollection.doc(activeAttemptId));
      const activeAttempt = activeSnapshot.data();
      if (!activeSnapshot.exists || !isRefundAttempt(activeAttempt) ||
          activeAttempt.id !== activeAttemptId || activeAttempt.orderId !== orderId ||
          activeAttempt.customerId !== customerId || activeAttempt.paymentId !== payment?.razorpayPaymentId) {
        return { kind: 'inconsistent' as const };
      }
      return { kind: 'existing' as const, attempt: activeAttempt };
    }

    if (order.cancellationStatus === 'processing' || order.cancellationStatus === 'completed' ||
        order.orderStatus === 'cancelled') return { kind: 'inconsistent' as const };

    // A missing pointer must not silently discard attempt history and create a second refund.
    const history = await transaction.get(attemptsCollection);
    if (history.docs.length > 0) return { kind: 'inconsistent' as const };

    if (!CANCELLABLE_STATUSES.has(String(order.orderStatus)) ||
        !Array.isArray(order.items) || order.items.length === 0 ||
        (order.items as OrderItem[]).some((item) => item.fulfillmentStatus !== 'pending') ||
        payment?.method !== 'razorpay' || payment.status !== 'captured' ||
        !isNonEmptyString(payment.razorpayPaymentId) || payment.reconciliationRequired === true) {
      return { kind: 'ineligible' as const };
    }
    const amount = getExpectedAmount(order);
    if (amount === null) return { kind: 'invalid_amount' as const };

    const now = new Date().toISOString();
    const requestBody = getRequestBody(orderId, amount);
    const attempt: RefundAttempt = {
      id: newAttemptRef.id,
      orderId,
      customerId,
      paymentId: payment.razorpayPaymentId,
      amount,
      currency: 'INR',
      requestBody,
      requestBodyJson: JSON.stringify(requestBody),
      idempotencyKey: `casaio-cancel-${newAttemptRef.id}`,
      state: 'not_submitted',
      createdAt: now,
      updatedAt: now,
    };
    transaction.create(newAttemptRef, attempt);
    transaction.update(orderRef, {
      cancellationStatus: 'processing',
      cancellationReason: 'Cancelled by customer',
      'payment.activeRefundAttemptId': attempt.id,
      updatedAt: now,
    });
    return { kind: 'reserved' as const, attempt };
  });
}

/** Keep an ambiguous or mismatched provider state visible without changing its attempt state. */
export async function markRefundReconciliationRequired(
  orderId: string,
  attemptId: string,
  reason: 'refund_submission_unknown' | 'refund_balance_uncertain' | 'refund_provider_data_invalid',
  db: RefundDatabase = adminDb,
) {
  const orderRef = db.collection('orders').doc(orderId);
  const attemptRef = getRefundAttemptRef(db, orderId, attemptId);
  return db.runTransaction(async (transaction) => {
    const [orderSnapshot, attemptSnapshot] = await Promise.all([
      transaction.get(orderRef), transaction.get(attemptRef),
    ]);
    if (!orderSnapshot.exists || !attemptSnapshot.exists) return { kind: 'not_found' as const };
    const order = orderSnapshot.data() as Record<string, unknown> | undefined;
    const attempt = attemptSnapshot.data();
    if (!order || !isRefundAttempt(attempt) ||
        (order.payment as Record<string, unknown> | undefined)?.activeRefundAttemptId !== attemptId) {
      return { kind: 'conflict' as const };
    }
    transaction.update(orderRef, {
      'payment.reconciliationRequired': true,
      'payment.reconciliationStatus': 'open',
      'payment.reconciliationReason': reason,
      updatedAt: new Date().toISOString(),
    });
    return { kind: 'marked' as const };
  });
}

/** Apply evidence from the verified Razorpay API response or signature-verified webhook. */
export async function transitionRefundAttempt(
  orderId: string,
  attemptId: string,
  nextState: RefundAttemptState,
  evidence?: VerifiedRefundEvidence,
  db: RefundDatabase = adminDb,
  operatorAudit?: RefundOperatorAudit,
) {
  const orderRef = db.collection('orders').doc(orderId);
  const attemptRef = getRefundAttemptRef(db, orderId, attemptId);
  const auditRef = operatorAudit
    ? getRefundReconciliationAuditRef(db, orderId, operatorAudit.actorUid, operatorAudit.actionId)
    : null;
  return db.runTransaction(async (transaction) => {
    const reads = [transaction.get(orderRef), transaction.get(attemptRef)];
    if (auditRef) reads.push(transaction.get(auditRef));
    const [orderSnapshot, attemptSnapshot, auditSnapshot] = await Promise.all(reads);
    if (auditSnapshot?.exists) return { kind: 'duplicate_action' as const };
    if (!orderSnapshot.exists || !attemptSnapshot.exists) return { kind: 'not_found' as const };
    const order = orderSnapshot.data() as Record<string, unknown> | undefined;
    const attemptValue = attemptSnapshot.data();
    if (!order || !isRefundAttempt(attemptValue)) return { kind: 'inconsistent' as const };
    const attempt = attemptValue;
    const writeOperatorAudit = () => {
      if (auditRef && operatorAudit) transaction.create(auditRef, refundAuditValue(orderId, attemptId, operatorAudit));
    };
    const payment = order.payment as Record<string, unknown> | undefined;
    if (attempt.id !== attemptId || attempt.orderId !== orderId ||
        payment?.activeRefundAttemptId !== attemptId || payment.razorpayPaymentId !== attempt.paymentId) {
      return { kind: 'conflict' as const };
    }
    if (evidence && payment.razorpayRefundId && payment.razorpayRefundId !== evidence.refundId) {
      return { kind: 'invalid_evidence' as const };
    }
    if (attempt.state === nextState) {
      if (nextState === 'submission_unknown' && !evidence) return { kind: 'already_applied' as const, attempt };
      if (evidence && isValidEvidence(attempt, evidence) && attempt.providerRefundId === evidence.refundId &&
          attempt.providerStatus === evidence.status) {
        if (operatorAudit && nextState !== 'submission_unknown') {
          transaction.update(orderRef, {
            'payment.reconciliationRequired': false,
            'payment.reconciliationStatus': 'resolved',
            'payment.reconciliationReason': FieldValue.delete(),
            updatedAt: new Date().toISOString(),
          });
        }
        writeOperatorAudit();
        return { kind: 'already_applied' as const, attempt };
      }
      return { kind: 'conflict' as const };
    }
    if (!ALLOWED_NEXT_STATES[attempt.state].includes(nextState)) {
      return { kind: 'invalid_transition' as const, state: attempt.state };
    }
    const now = new Date().toISOString();
    if (nextState === 'submission_unknown') {
      if (evidence) return { kind: 'invalid_evidence' as const };
      const updated = { ...attempt, state: nextState, submissionStartedAt: now, updatedAt: now };
      transaction.update(attemptRef, updated);
      writeOperatorAudit();
      return { kind: 'transitioned' as const, attempt: updated };
    }
    if (!evidence || !isValidEvidence(attempt, evidence) || stateForProviderStatus(evidence.status) !== nextState ||
        (attempt.providerRefundId && attempt.providerRefundId !== evidence.refundId)) {
      return { kind: 'invalid_evidence' as const };
    }

    // The legacy signed-webhook path can finalize the order before this attempt
    // is synchronized. Treat that durable server-side state as the final evidence
    // and never restore inventory a second time.
    if (nextState === 'succeeded' && order.orderStatus === 'cancelled' &&
        order.cancellationStatus === 'completed' && payment.status === 'refunded' &&
        payment.razorpayRefundId === evidence.refundId) {
      const updated = {
        ...attempt, state: 'succeeded' as const, providerRefundId: evidence.refundId,
        providerStatus: 'processed' as const, providerVerifiedAt: now, updatedAt: now,
      };
      transaction.update(attemptRef, updated);
      writeOperatorAudit();
      return { kind: 'transitioned' as const, attempt: updated };
    }

    let inventory: ReturnType<typeof buildCancellationInventoryUpdates> | undefined;
    let productRefs: FirebaseFirestore.DocumentReference[] = [];
    let productSnapshots: FirebaseFirestore.DocumentSnapshot[] = [];
    let activeAttemptSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
    let checkoutCoordinationSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
    if (nextState === 'succeeded') {
      if (order.cancellationStatus !== 'processing' || !Array.isArray(order.items)) {
        return { kind: 'conflict' as const };
      }
      const items = order.items as OrderItem[];
      productRefs = Array.from(new Set(items.map((item) => item.productId)))
        .map((productId) => db.collection('products').doc(productId));
      const reads = await Promise.all([
        ...productRefs.map((ref) => transaction.get(ref)),
        transaction.get(getActivePaymentAttemptRef(attempt.customerId)),
        transaction.get(getCheckoutCoordinationRef(attempt.customerId)),
      ]);
      productSnapshots = reads.slice(0, productRefs.length) as FirebaseFirestore.DocumentSnapshot[];
      activeAttemptSnapshot = reads[productRefs.length] as FirebaseFirestore.DocumentSnapshot;
      checkoutCoordinationSnapshot = reads[productRefs.length + 1] as FirebaseFirestore.DocumentSnapshot;
      const productData = new Map<string, Record<string, unknown>>();
      productSnapshots.forEach((snapshot, index) => {
        if (snapshot.exists) productData.set(productRefs[index].id, snapshot.data() || {});
      });
      inventory = buildCancellationInventoryUpdates(items, productData, now);
    }

    const updated: RefundAttempt = {
      ...attempt, state: nextState, providerRefundId: evidence.refundId,
      providerStatus: evidence.status, providerVerifiedAt: now, updatedAt: now,
    };
    transaction.update(attemptRef, updated);

    if (nextState === 'provider_identified') {
      transaction.update(orderRef, {
        'payment.status': 'refund_pending',
        'payment.razorpayRefundId': evidence.refundId,
        ...(operatorAudit || payment.reconciliationReason === 'refund_submission_unknown' ? {
          'payment.reconciliationRequired': false,
          'payment.reconciliationStatus': 'resolved',
          'payment.reconciliationReason': FieldValue.delete(),
        } : {}),
        updatedAt: now,
      });
      writeOperatorAudit();
      return { kind: 'transitioned' as const, attempt: updated };
    }
    if (nextState === 'failed') {
      transaction.update(orderRef, {
        cancellationStatus: 'failed',
        'payment.status': 'refund_failed',
        'payment.razorpayRefundId': evidence.refundId,
        ...(operatorAudit || payment.reconciliationReason === 'refund_submission_unknown' ? {
          'payment.reconciliationRequired': false,
          'payment.reconciliationStatus': 'resolved',
          'payment.reconciliationReason': FieldValue.delete(),
        } : {}),
        updatedAt: now,
      });
      writeOperatorAudit();
      return { kind: 'transitioned' as const, attempt: updated };
    }

    if (!inventory || !Array.isArray(order.items)) return { kind: 'inconsistent' as const };
    if (!inventory.ok || order.items.some((item: OrderItem) => item.fulfillmentStatus !== 'pending')) {
      transaction.update(orderRef, {
        'payment.status': 'refunded',
        'payment.razorpayRefundId': evidence.refundId,
        'payment.reconciliationRequired': true,
        'payment.reconciliationStatus': 'open',
        'payment.reconciliationReason': 'cancellation_inventory_restore_failed',
        cancellationStatus: 'failed',
        updatedAt: now,
      });
      writeOperatorAudit();
      return { kind: 'reconciliation_required' as const, attempt: updated };
    }

    for (const [productId, changes] of inventory.updates) {
      transaction.update(db.collection('products').doc(productId), changes);
    }
    transaction.update(orderRef, {
      orderStatus: 'cancelled',
      items: (order.items as OrderItem[]).map((item) => ({ ...item, fulfillmentStatus: 'cancelled' })),
      cancellationStatus: 'completed',
      'payment.status': 'refunded',
      'payment.razorpayRefundId': evidence.refundId,
      ...(operatorAudit || payment.reconciliationReason === 'refund_submission_unknown' ? {
        'payment.reconciliationRequired': false,
        'payment.reconciliationStatus': 'resolved',
        'payment.reconciliationReason': FieldValue.delete(),
      } : {}),
      statusTimeline: [
        ...(Array.isArray(order.statusTimeline) ? order.statusTimeline : []),
        { status: 'cancelled', timestamp: now, note: 'Order cancelled after Razorpay confirmed the refund.', updatedBy: 'system' },
      ],
      updatedAt: now,
    });
    const activeRef = getActivePaymentAttemptRef(attempt.customerId);
    if (activeAttemptSnapshot?.exists && activeAttemptSnapshot.data()?.orderId === orderId) transaction.delete(activeRef);
    const coordinationRef = getCheckoutCoordinationRef(attempt.customerId);
    if (checkoutCoordinationSnapshot?.exists && checkoutCoordinationSnapshot.data()?.orderId === orderId) {
      transaction.delete(coordinationRef);
    }
    writeOperatorAudit();
    return { kind: 'transitioned' as const, attempt: updated };
  });
}
