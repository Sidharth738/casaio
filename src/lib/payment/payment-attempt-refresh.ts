export type ActivePaymentAttemptStatus = 'pending' | 'authorized' | 'failed' | 'unknown';

export type PaymentAttemptRefreshResult =
  | { kind: 'unavailable'; httpStatus: number }
  | { kind: 'inactive' }
  | { kind: 'captured'; orderId: string }
  | {
      kind: 'active';
      attempt: {
        orderId: string;
        orderNumber?: string;
        status: ActivePaymentAttemptStatus;
        retryAvailable: boolean;
      };
    };

/** Parse only the safe status fields used by checkout; unknown payloads stay guarded. */
export function classifyPaymentAttemptRefresh(
  responseOk: boolean,
  httpStatus: number,
  payload: unknown,
): PaymentAttemptRefreshResult {
  if (!responseOk || !payload || typeof payload !== 'object' || !('active' in payload) ||
      typeof payload.active !== 'boolean') {
    return { kind: 'unavailable', httpStatus };
  }

  const data = payload as Record<string, unknown>;
  if (!data.active) return { kind: 'inactive' };

  if (data.status === 'captured' && typeof data.orderId === 'string' && data.orderId.length > 0) {
    return { kind: 'captured', orderId: data.orderId };
  }

  const status: ActivePaymentAttemptStatus = data.status === 'authorized' || data.status === 'failed' || data.status === 'pending'
    ? data.status
    : 'unknown';
  return {
    kind: 'active',
    attempt: {
      orderId: typeof data.orderId === 'string' ? data.orderId : '',
      ...(typeof data.orderNumber === 'string' ? { orderNumber: data.orderNumber } : {}),
      status,
      retryAvailable: data.retryAvailable === true,
    },
  };
}

/** An inactive lock is not enough to clear a warning when a known order failed lookup. */
export function resolveInactiveAttemptRefresh(
  knownOrderId: string | undefined,
  persistedOrderState: string | null,
): 'inactive' | 'recovered' | 'unavailable' {
  if (!knownOrderId) return 'inactive';
  return persistedOrderState === null ? 'unavailable' : 'recovered';
}
