export type ReconciliationView = {
  kind: 'verified' | 'unknown' | 'manual_review' | 'access' | 'error' | 'duplicate';
  title: string;
  message: string;
};

const diagnosticLabels: Record<string, string> = {
  refund_submission_unknown: 'Submission outcome unknown',
  refund_balance_uncertain: 'Refund balance needs review',
  refund_provider_data_invalid: 'Provider data needs review',
  refund_provider_status_unknown: 'Provider status unknown',
  provider_refund_not_found: 'Refund not found at provider',
  provider_refund_ambiguous: 'Multiple provider matches',
  provider_evidence_mismatch: 'Provider evidence mismatch',
  attempt_submission_state_unresolved: 'Submission state unresolved',
  persisted_attempt_mismatch: 'Stored attempt mapping mismatch',
  terminal_state_conflict: 'Terminal state conflict',
  firestore_transaction_failure: 'Persistence update failed',
  razorpay_provider_failure: 'Provider status unavailable',
  razorpay_configuration_failure: 'Provider configuration unavailable',
  simulation_not_supported: 'Provider verification unavailable in simulation',
  cancellation_inventory_restore_failed: 'Inventory restoration needs review',
  provider_evidence_rejected: 'Provider evidence rejected',
  manual_review_required: 'Manual review required',
};

export function refundDiagnosticLabel(category: unknown): string {
  return typeof category === 'string' ? diagnosticLabels[category] || 'Manual review required' : 'Manual review required';
}

export function formatRefundAmount(amountPaise: number, currency: string): string {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0 || !/^[A-Z]{3}$/.test(currency)) return 'Amount unavailable';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountPaise / 100);
  } catch {
    return 'Amount unavailable';
  }
}

export function formatAttemptAge(createdAt: unknown, now = Date.now()): string {
  const parsed = typeof createdAt === 'string' || typeof createdAt === 'number' ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(parsed)) return 'Age unavailable';
  const minutes = Math.max(0, Math.floor((now - parsed) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function buildReconciliationRequest(orderId: string, attemptId: string, idempotencyKey: string) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ orderId, attemptId }),
  };
}

export function describeLoadFailure(httpStatus: number): ReconciliationView {
  if (httpStatus === 401 || httpStatus === 403) {
    return { kind: 'access', title: 'Admin access required', message: 'Your admin session may have expired or lacks permission. Sign in again before continuing.' };
  }
  if (httpStatus === 404 || httpStatus === 409) {
    return { kind: 'error', title: 'Case data is stale', message: 'This case may have changed or been removed. Refresh the list before taking another action.' };
  }
  return { kind: 'error', title: 'Cases could not be loaded', message: 'The persisted case data is temporarily unavailable. No reconciliation action was submitted.' };
}

export function describeReconciliationResponse(httpStatus: number, payload: unknown): ReconciliationView {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const status = typeof body.status === 'string' ? body.status : '';

  if (httpStatus === 401 || httpStatus === 403) {
    return { kind: 'access', title: 'Admin access required', message: 'Your admin session may have expired or lacks permission. Sign in again before continuing.' };
  }
  if (status === 'processed') return { kind: 'verified', title: 'Refund processed', message: 'The provider status was verified and saved.' };
  if (status === 'failed') return { kind: 'verified', title: 'Refund failed', message: 'The provider failure status was verified and saved. No new refund was submitted.' };
  if (status === 'pending') return { kind: 'verified', title: 'Refund pending', message: 'The provider reports a pending refund. No new refund was submitted.' };
  if (status === 'reconciliation_required') {
    return { kind: 'manual_review', title: 'Provider success; order still needs review', message: 'The refund status is verified, but the order could not be fully finalized. Review the persisted order and audit history.' };
  }
  if (status === 'duplicate_action') return { kind: 'duplicate', title: 'Action already recorded', message: 'The prior action was already applied. The current persisted case has been reloaded.' };
  if (httpStatus === 409 && typeof body.message === 'string' && body.message.includes('does not match')) {
    return { kind: 'manual_review', title: 'Provider evidence mismatch', message: 'Stored attempt data did not match provider evidence. The result was not applied; keep the case open for review.' };
  }
  if (httpStatus === 409) {
    return { kind: 'manual_review', title: 'Reconciliation requires review', message: 'The persisted mapping or provider evidence could not be safely applied. No refund was submitted and the case remains open.' };
  }
  if (status === 'unknown' || httpStatus === 202 || httpStatus === 409 || httpStatus >= 500) {
    return { kind: 'unknown', title: 'Outcome remains unconfirmed', message: 'Provider evidence was unavailable, stale, or mismatched. No refund was submitted; keep this case open for review.' };
  }
  return { kind: 'error', title: 'Reconciliation could not be completed', message: 'The case was not confirmed. Refresh the persisted case and try again later.' };
}
