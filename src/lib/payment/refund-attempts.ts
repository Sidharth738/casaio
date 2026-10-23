import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { RefundAttempt, RefundAttemptState, RefundProviderStatus } from '@/types/order';

export type ProviderRefundEvidence = {
  source: 'provider_api' | 'signed_webhook';
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  refundId: string;
  status: RefundProviderStatus;
};

type RefundDatabase = Pick<Firestore, 'collection' | 'runTransaction'>;

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

export function isRefundAttemptState(value: unknown): value is RefundAttemptState {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_NEXT_STATES, value);
}

export function isRefundAttempt(value: unknown): value is RefundAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Record<string, unknown>;
  if (!isRefundAttemptState(attempt.state) || !isNonEmptyString(attempt.id) ||
      !isNonEmptyString(attempt.orderId) || !isNonEmptyString(attempt.customerId) ||
      !isNonEmptyString(attempt.paymentId) || !Number.isSafeInteger(attempt.amount) ||
      Number(attempt.amount) <= 0 || attempt.currency !== 'INR' ||
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

function stateForProviderStatus(status: RefundProviderStatus): RefundAttemptState {
  if (status === 'pending') return 'provider_identified';
  return status === 'processed' ? 'succeeded' : 'failed';
}

function isValidEvidence(attempt: RefundAttempt, evidence: ProviderRefundEvidence) {
  return (evidence.source === 'provider_api' || evidence.source === 'signed_webhook') &&
    evidence.orderId === attempt.orderId && evidence.paymentId === attempt.paymentId &&
    Number.isSafeInteger(evidence.amount) && evidence.amount === attempt.amount &&
    evidence.currency === attempt.currency && isNonEmptyString(evidence.refundId) &&
    ['pending', 'processed', 'failed'].includes(evidence.status);
}

export async function reserveCancellationRefundAttempt(
  orderId: string,
  customerId: string,
  db: RefundDatabase = adminDb,
) {
  if (!orderId || !customerId) return { kind: 'invalid_request' as const };
  const orderRef = db.collection('orders').doc(orderId);
  const newAttemptRef = orderRef.collection('refundAttempts').doc();
  return db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) return { kind: 'not_found' as const };
    const order = orderSnapshot.data() as Record<string, unknown> | undefined;
    if (!order || order.customerId !== customerId) return { kind: 'not_found' as const };
    const payment = order.payment as Record<string, unknown> | undefined;
    const activeAttemptId = payment?.activeRefundAttemptId;
    if (typeof activeAttemptId === 'string' && activeAttemptId) {
      const activeRef = orderRef.collection('refundAttempts').doc(activeAttemptId);
      const activeSnapshot = await transaction.get(activeRef);
      if (!activeSnapshot.exists || !isRefundAttempt(activeSnapshot.data())) return { kind: 'inconsistent' as const };
      return { kind: 'existing' as const, attempt: activeSnapshot.data() as RefundAttempt };
    }
    if (order.cancellationStatus !== 'processing') return { kind: 'ineligible' as const };
    const attempt: RefundAttempt = {
      id: newAttemptRef.id,
      orderId,
      customerId,
      paymentId: String(payment?.razorpayPaymentId || ''),
      amount: 1,
      currency: 'INR',
      state: 'not_submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const amount = Number((order.pricing as Record<string, unknown> | undefined)?.totalAmount);
    if (!attempt.paymentId || !Number.isFinite(amount) || amount <= 0) return { kind: 'ineligible' as const };
    attempt.amount = Math.round(amount * 100);
    transaction.create(newAttemptRef, attempt);
    transaction.update(orderRef, { 'payment.activeRefundAttemptId': attempt.id, updatedAt: attempt.updatedAt });
    return { kind: 'reserved' as const, attempt };
  });
}

export async function transitionRefundAttempt(
  orderId: string,
  attemptId: string,
  nextState: RefundAttemptState,
  evidence?: ProviderRefundEvidence,
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
    const attemptValue = attemptSnapshot.data();
    if (!order || !isRefundAttempt(attemptValue)) return { kind: 'inconsistent' as const };
    const attempt = attemptValue;
    if (attempt.id !== attemptId || attempt.orderId !== orderId ||
        (order.payment as Record<string, unknown> | undefined)?.activeRefundAttemptId !== attemptId) {
      return { kind: 'conflict' as const };
    }
    if (attempt.state === nextState) {
      if (nextState === 'submission_unknown' && !evidence) return { kind: 'already_applied' as const, attempt };
      if (evidence && isValidEvidence(attempt, evidence) && attempt.providerRefundId === evidence.refundId &&
          attempt.providerStatus === evidence.status) return { kind: 'already_applied' as const, attempt };
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
      return { kind: 'transitioned' as const, attempt: updated };
    }
    if (!evidence || !isValidEvidence(attempt, evidence) || stateForProviderStatus(evidence.status) !== nextState ||
        (attempt.providerRefundId && attempt.providerRefundId !== evidence.refundId)) {
      return { kind: 'invalid_evidence' as const };
    }
    const updated = {
      ...attempt, state: nextState, providerRefundId: evidence.refundId,
      providerStatus: evidence.status, providerVerifiedAt: now, updatedAt: now,
    };
    transaction.update(attemptRef, updated);
    return { kind: 'transitioned' as const, attempt: updated };
  });
}
