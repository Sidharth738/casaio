import type { PaymentStatus } from '@/types/order';

export type RefundDisplay = {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
  notice?: string;
  reference?: string;
};

/** Customer-safe payment/refund presentation, independent from the order status. */
export function getRefundDisplay(status: PaymentStatus, refundId?: string): RefundDisplay {
  const display: RefundDisplay = status === 'refund_pending'
    ? {
        label: 'Refund processing',
        tone: 'warning',
        notice: 'Your bank or payment method controls when the refund appears.',
      }
    : status === 'refunded'
      ? {
          label: 'Refund processed',
          tone: 'success',
          notice: 'Razorpay confirmed the refund; bank and payment-method posting times vary.',
        }
      : status === 'refund_failed'
        ? {
            label: 'Refund failed',
            tone: 'error',
            notice: 'The refund was not completed. Please contact support.',
          }
        : status === 'captured'
          ? { label: 'Captured', tone: 'success' }
          : status === 'failed'
            ? { label: 'Failed', tone: 'error' }
            : status === 'authorized'
              ? { label: 'Authorized', tone: 'warning' }
              : { label: 'Pending', tone: 'neutral' };

  if (refundId && ['refund_pending', 'refunded', 'refund_failed'].includes(status)) {
    display.reference = refundId;
  }
  return display;
}
