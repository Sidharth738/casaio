import { UserAddress } from './user';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type FulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'razorpay' | 'cod';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refund_pending' | 'refund_failed' | 'refunded';
export type CancellationStatus = 'none' | 'processing' | 'completed' | 'failed';

export type RefundAttemptState =
  | 'not_submitted'
  | 'submission_unknown'
  | 'provider_identified'
  | 'succeeded'
  | 'failed';

export type RefundProviderStatus = 'pending' | 'processed' | 'failed';

/** Durable server-side record for a single cancellation refund submission. */
export interface RefundAttempt {
  id: string;
  orderId: string;
  customerId: string;
  paymentId: string;
  amount: number;
  currency: 'INR';
  /** Immutable provider request used verbatim for every submission under this attempt. */
  requestBody: {
    amount: number;
    speed: 'normal';
    receipt: string;
    notes: { orderId: string; reason: 'Customer cancellation' };
  };
  requestBodyJson: string;
  idempotencyKey: string;
  state: RefundAttemptState;
  createdAt: string;
  updatedAt: string;
  submissionStartedAt?: string;
  providerRefundId?: string;
  providerStatus?: RefundProviderStatus;
  providerVerifiedAt?: string;
}

export interface OrderItem {
  productId: string;
  variantSku?: string;
  title: string;
  slug: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  sellerId: string;
  sellerStoreName: string;
  fulfillmentStatus: FulfillmentStatus;
  trackingDetails?: {
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string;
    shippedAt?: string;
    estimatedDelivery?: string;
  };
}

export interface OrderPricing {
  /** Tax-inclusive item subtotal before discounts, in INR. */
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  /** GST component already included in payableItemsTotal; never add it again. */
  taxAmount: number;
  totalAmount: number;
  /** Discounted tax-inclusive item amount for newly calculated orders. */
  payableItemsTotal?: number;
  /** GST fraction (0.18 means 18%); absent on historical orders. */
  taxRate?: number;
  /** Item amount before the included GST component; absent on historical orders. */
  preTaxAmount?: number;
}

export interface CouponTermsSnapshotV1 {
  version: 1;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  perUserLimit: number;
}

/** Legacy records retain code/discountValue; new records include the versioned server snapshot. */
export type OrderCouponApplied =
  | {
      code: string;
      discountValue: number;
      couponId?: string;
      discountAmount?: number;
      termsSnapshot?: undefined;
    }
  | {
      couponId: string;
      code: string;
      termsSnapshot: CouponTermsSnapshotV1;
      discountAmount: number;
      /** Compatibility alias for legacy consumers; this is the applied amount. */
      discountValue?: number;
    };

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayAuthorizedPaymentId?: string;
  razorpaySignature?: string;
  razorpayRefundId?: string;
  /** Points to the single cancellation refund attempt reserved for this order. */
  activeRefundAttemptId?: string;
  authorizedAt?: string;
  lastFailureAt?: string;
  lastFailurePaymentId?: string;
  lastFailureReason?: string;
  failureFinalizedAt?: string;
  reconciliationRequired?: boolean;
  reconciliationStatus?: 'open' | 'reviewed' | 'resolved';
  reconciliationReason?: string;
  reconciliationPaymentIds?: string[];
  paidAt?: string;
}

export interface OrderTimelineEvent {
  status: OrderStatus | string;
  timestamp: string;
  note: string;
  updatedBy: string; // userId or 'system'
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerDetails: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: UserAddress;
  items: OrderItem[];
  sellerIds: string[];
  pricing: OrderPricing;
  couponApplied?: OrderCouponApplied;
  payment: OrderPayment;
  orderStatus: OrderStatus;
  cancellationReason?: string;
  cancellationStatus?: CancellationStatus;
  statusTimeline: OrderTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}
