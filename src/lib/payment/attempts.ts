import type Razorpay from 'razorpay';
import { adminDb } from '@/lib/firebase/admin';
export { canRetryExistingOrder, getCaptureReconciliationReason, isCapturedPaymentForOrder, isCheckoutCoordinationFresh } from '@/lib/payment/attempt-state';

export const PAYMENT_STATUS_TIMEOUT_MS = 8_000;

export function getActivePaymentAttemptRef(userId: string) {
  return adminDb.collection('checkoutRequests').doc(`_active_razorpay_${userId}`);
}

export function getCheckoutCoordinationRef(userId: string) {
  return adminDb.collection('checkoutRequests').doc(`_checkout_coord_${userId}`);
}

/** Razorpay's SDK wraps Axios but does not expose a timeout option in its public config. */
export function configureRazorpayTimeout(client: Razorpay, timeoutMs = PAYMENT_STATUS_TIMEOUT_MS) {
  const sdkClient = client as unknown as {
    api?: { rq?: { defaults?: { timeout?: number } } };
  };
  const axiosDefaults = sdkClient.api?.rq?.defaults;
  if (!axiosDefaults) throw new Error('Razorpay HTTP client timeout is unavailable');
  axiosDefaults.timeout = timeoutMs;
}
