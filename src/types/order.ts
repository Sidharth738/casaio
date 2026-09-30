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
export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded';

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
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
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
  couponApplied?: {
    code: string;
    discountValue: number;
  };
  payment: OrderPayment;
  orderStatus: OrderStatus;
  cancellationReason?: string;
  statusTimeline: OrderTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}
