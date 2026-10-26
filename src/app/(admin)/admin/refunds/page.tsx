'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Eye, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  buildReconciliationRequest,
  describeLoadFailure,
  describeReconciliationResponse,
  formatAttemptAge,
  formatRefundAmount,
  refundDiagnosticLabel,
  type ReconciliationView,
} from '@/lib/payment/refund-reconciliation-ui';

type RefundRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  state: string;
  createdAt?: string;
  providerStatus?: string;
  diagnosticCategory: string;
};

type RefundCase = {
  case: {
    orderId: string;
    orderNumber?: string;
    orderStatus?: string;
    cancellationStatus?: string;
    payment: {
      method?: string;
      status?: string;
      paymentReference?: string;
      refundReference?: string;
      reconciliationRequired: boolean;
      diagnosticCategory: string;
    };
    attempts: Array<{
      id: string;
      amount?: number;
      currency?: string;
      state: string;
      createdAt?: string;
      updatedAt?: string;
      providerRefundReference?: string;
      providerStatus?: string;
      providerVerifiedAt?: string;
    }>;
    history: Array<{
      id: string;
      action?: string;
      outcome?: string;
      diagnosticCategory?: string;
      providerStatus?: string;
      actorReference?: string;
      createdAt?: string;
    }>;
  };
};

type ApiError = Error & { status?: number };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof payload.error === 'string' ? payload.error : 'Request failed') as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function formatDate(value?: string) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function statusTone(state: string) {
  if (state === 'succeeded' || state === 'processed') return 'accent' as const;
  if (state === 'failed') return 'danger' as const;
  return 'secondary' as const;
}

function errorView(error: unknown): ReconciliationView {
  const status = (error as ApiError | null)?.status;
  return describeLoadFailure(status || 0);
}

export default function AdminRefundsPage() {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [details, setDetails] = useState<RefundCase | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [queueError, setQueueError] = useState<ReconciliationView | null>(null);
  const [detailsError, setDetailsError] = useState<ReconciliationView | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ReconciliationView | null>(null);
  const actionInFlight = useRef(false);

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const data = await getJson<{ refunds: RefundRow[] }>('/api/admin/payment-reconciliation?refunds=true', signal);
      setRows(Array.isArray(data.refunds) ? data.refunds : []);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setQueueError(errorView(error));
    } finally {
      if (!signal?.aborted) setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadQueue(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const controller = new AbortController();
    void getJson<RefundCase>(`/api/admin/payment-reconciliation?refundOrderId=${encodeURIComponent(selectedOrderId)}`, controller.signal)
      .then(setDetails)
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setDetailsError(errorView(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [selectedOrderId]);

  const confirmReconciliation = async () => {
    const attempt = currentDetails?.case.attempts.find((candidate) => candidate.id === activeAttemptId);
    if (!currentDetails || !attempt || actionInFlight.current) return;
    actionInFlight.current = true;
    setActionLoading(true);
    setConfirmationOpen(false);
    setActionResult(null);
    try {
      const actionId = `admin_reconcile_${globalThis.crypto.randomUUID()}`;
      const options = buildReconciliationRequest(currentDetails.case.orderId, attempt.id, actionId);
      const response = await fetch('/api/admin/payment-reconciliation', {
        ...options,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      setActionResult(describeReconciliationResponse(response.status, payload));
      await Promise.all([loadQueue(), getJson<RefundCase>(`/api/admin/payment-reconciliation?refundOrderId=${encodeURIComponent(currentDetails.case.orderId)}`)
        .then(setDetails).catch(() => undefined)]);
    } catch {
      setActionResult(describeReconciliationResponse(503, { status: 'unknown' }));
      await loadQueue();
    } finally {
      actionInFlight.current = false;
      setActionLoading(false);
    }
  };

  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const currentDetails = details?.case.orderId === selectedOrderId ? details : null;
  const activeAttemptId = currentDetails?.case.attempts.some((attempt) => attempt.id === selectedAttemptId)
    ? selectedAttemptId
    : currentDetails?.case.attempts[0]?.id || null;
  const selectedAttempt = currentDetails?.case.attempts.find((attempt) => attempt.id === activeAttemptId);
  const canReconcile = Boolean(selectedAttempt && (currentDetails?.case.payment.reconciliationRequired ||
    ['not_submitted', 'submission_unknown', 'provider_identified', 'failed'].includes(selectedAttempt.state)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Payments operations</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-zinc-950">Refund reconciliation</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Review persisted refund cases and verify provider status. This workflow never submits or retries a refund.
          </p>
        </div>
        <button type="button" onClick={() => void loadQueue()} disabled={queueLoading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60">
          {queueLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh cases
        </button>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Safety:</strong> Reconcile checks existing provider records only. It cannot create, retry, or alter a refund request.
      </div>

      {queueError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><strong>{queueError.title}.</strong> {queueError.message}</div>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div><h2 className="font-semibold text-zinc-950">Unresolved refund cases</h2><p className="mt-1 text-xs text-zinc-500">Up to 100 persisted attempts for review</p></div>
            <Badge variant="secondary" size="sm">{rows.length}</Badge>
          </div>
          {queueLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading cases…</div>
            : rows.length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">No unresolved refund attempts are currently listed.</div>
              : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-3">Order reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Attempt</th><th className="px-4 py-3">Age</th><th className="px-4 py-3">Diagnostic</th><th className="px-4 py-3"> </th></tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((row) => <tr key={`${row.orderId}:${row.id}`} className={selectedOrderId === row.orderId ? 'bg-orange-50/60' : 'hover:bg-zinc-50'}>
                    <td className="px-4 py-4"><span className="block font-mono font-semibold text-zinc-900">{row.orderNumber || row.orderId}</span><span className="mt-1 block text-[10px] text-zinc-500">{row.orderId}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-zinc-800">{formatRefundAmount(row.amount, row.currency)}</td>
                    <td className="px-4 py-4"><Badge variant={statusTone(row.state)} size="sm">{row.state.replaceAll('_', ' ')}</Badge>{row.providerStatus && <span className="mt-1 block text-[10px] text-zinc-500">Provider: {row.providerStatus}</span>}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-zinc-600"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatAttemptAge(row.createdAt)}</span></td>
                    <td className="px-4 py-4 text-zinc-600">{refundDiagnosticLabel(row.diagnosticCategory)}</td>
                    <td className="px-4 py-4"><button type="button" onClick={() => { setSelectedOrderId(row.orderId); setDetailsLoading(true); setDetailsError(null); setActionResult(null); }} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1.5 font-medium text-zinc-800 hover:bg-zinc-100"><Eye className="h-3.5 w-3.5" />Inspect</button></td>
                  </tr>)}
                </tbody>
              </table></div>}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-zinc-950">Persisted case details</h2>
            {detailsLoading && !currentDetails ? <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading case…</div>
              : detailsError ? <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{detailsError.title}. {detailsError.message}</div>
                : !currentDetails ? <p className="py-10 text-sm text-zinc-500">Select a case to inspect its saved order, payment, attempt, and audit history.</p>
                  : <div className="mt-4 space-y-4 text-sm">
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-zinc-50 p-3">
                      <dt className="text-zinc-500">Order</dt><dd className="text-right font-mono text-zinc-900">{currentDetails.case.orderNumber || currentDetails.case.orderId}</dd>
                      <dt className="text-zinc-500">Order state</dt><dd className="text-right capitalize text-zinc-900">{currentDetails.case.orderStatus || 'Unknown'}</dd>
                      <dt className="text-zinc-500">Cancellation</dt><dd className="text-right capitalize text-zinc-900">{currentDetails.case.cancellationStatus || 'Unknown'}</dd>
                      <dt className="text-zinc-500">Payment</dt><dd className="text-right capitalize text-zinc-900">{currentDetails.case.payment.method || 'Unknown'} · {currentDetails.case.payment.status || 'Unknown'}</dd>
                      <dt className="text-zinc-500">Payment reference</dt><dd className="text-right font-mono text-zinc-700">{currentDetails.case.payment.paymentReference || 'Not available'}</dd>
                      <dt className="text-zinc-500">Refund reference</dt><dd className="text-right font-mono text-zinc-700">{currentDetails.case.payment.refundReference || 'Not available'}</dd>
                    </dl>
                    <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Refund attempts</h3>
                      {currentDetails.case.attempts.map((attempt) => <button type="button" key={attempt.id} onClick={() => setSelectedAttemptId(attempt.id)} className={`mb-2 w-full rounded-lg border p-3 text-left ${activeAttemptId === attempt.id ? 'border-orange-300 bg-orange-50' : 'border-zinc-200'}`}>
                        <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-zinc-600">{attempt.id}</span><Badge variant={statusTone(attempt.state)} size="sm">{attempt.state.replaceAll('_', ' ')}</Badge></div>
                        <div className="mt-2 flex justify-between text-xs text-zinc-600"><span>{formatRefundAmount(attempt.amount ?? -1, attempt.currency || '')}</span><span>{attempt.providerStatus ? `Provider: ${attempt.providerStatus}` : 'Provider status not verified'}</span></div>
                        <div className="mt-1 text-[10px] text-zinc-500">Created {formatDate(attempt.createdAt)} · Updated {formatDate(attempt.updatedAt)}</div>
                      </button>)}
                    </div>
                    {selectedAttempt && <div className="rounded-lg border border-zinc-200 p-3 text-xs text-zinc-600"><div>Provider refund reference: <span className="font-mono text-zinc-900">{selectedAttempt.providerRefundReference || 'Not identified'}</span></div><div className="mt-1">Provider verified: {formatDate(selectedAttempt.providerVerifiedAt)}</div><div className="mt-1">Case diagnostic: {refundDiagnosticLabel(currentDetails.case.payment.diagnosticCategory)}</div></div>}
                    <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Operator and provider history</h3>
                      {currentDetails.case.history.length === 0 ? <p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">No reconciliation actions have been recorded.</p> : <ol className="max-h-48 space-y-2 overflow-y-auto">{currentDetails.case.history.map((event) => <li key={event.id} className="rounded-lg bg-zinc-50 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong className="text-zinc-800">{(event.outcome || event.action || 'recorded').replaceAll('_', ' ')}</strong><time className="text-zinc-500">{formatDate(event.createdAt)}</time></div><div className="mt-1 text-zinc-600">{refundDiagnosticLabel(event.diagnosticCategory)}{event.providerStatus ? ` · Provider: ${event.providerStatus}` : ''}</div><div className="mt-1 text-[10px] text-zinc-500">Admin {event.actorReference || 'reference unavailable'}</div></li>)}</ol>}
                    </div>
                    {actionResult && <div role="status" className={`rounded-lg border p-3 text-sm ${actionResult.kind === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : actionResult.kind === 'duplicate' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><strong>{actionResult.title}.</strong> {actionResult.message}</div>}
                    {canReconcile && <button type="button" onClick={() => setConfirmationOpen(true)} disabled={!selectedAttempt || actionLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reconcile provider status
                    </button>}
                  </div>}
          </section>
          <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /><p>Only a server-authorized admin can load or reconcile these records. Payment references are masked; customer details and provider credentials are not displayed.</p></div>
        </div>
      </section>

      {confirmationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="reconcile-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><h2 id="reconcile-confirm-title" className="font-semibold text-zinc-950">Check provider status?</h2><p className="mt-2 text-sm text-zinc-600">This reads existing payment and refund records and records the operator action. It will not submit or retry a refund. An unknown or mismatched result remains unresolved.</p></div></div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setConfirmationOpen(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700">Go back</button><button type="button" onClick={() => void confirmReconciliation()} disabled={actionLoading} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{actionLoading ? 'Checking…' : 'Confirm status check'}</button></div>
        </section>
      </div>}
    </div>
  );
}
