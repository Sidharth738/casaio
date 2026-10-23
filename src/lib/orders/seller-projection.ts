import type {
  FulfillmentStatus,
  Order,
  OrderStatus,
  OrderTimelineEvent,
  PaymentMethod,
  PaymentStatus,
} from '@/types';

export interface SellerOrderItem {
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

export interface SellerOrderShippingAddress {
  fullName: string;
  phoneNumber: string;
  alternatePhone?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface SellerOrderCustomerDetails {
  name: string;
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  items: SellerOrderItem[];
  sellerSubtotal: number;
  customerDetails: SellerOrderCustomerDetails;
  shippingAddress: SellerOrderShippingAddress;
  statusTimeline?: OrderTimelineEvent[];
}

/**
 * Projects a raw Order document into a seller-scoped representation.
 *
 * Guarantees:
 * - Contains ONLY items belonging to the requesting seller.
 * - Omits other vendors' items, pricing, SKUs, and tracking information.
 * - Omits entire order-level pricing (cart subtotal, discount, coupon codes, tax, shipping fee, grand total).
 * - Omits gateway payment identifiers and transaction secrets (Razorpay order/payment IDs, signatures, timestamps).
 * - Excludes customer account metadata (customerId, customer account email, personal account phone).
 * - Provides only essential customer delivery fulfillment information (recipient name and shipping address for courier label generation).
 *
 * If the seller has no line items in the order, returns null.
 */
export function projectSellerOrder(order: Order, sellerId: string): SellerOrder | null {
  if (!order || !sellerId || !Array.isArray(order.items)) {
    return null;
  }

  const sellerItems = order.items.filter((item) => item.sellerId === sellerId);
  if (sellerItems.length === 0) {
    return null;
  }

  const projectedItems: SellerOrderItem[] = sellerItems.map((item) => ({
    productId: item.productId,
    ...(item.variantSku ? { variantSku: item.variantSku } : {}),
    title: item.title,
    slug: item.slug,
    imageUrl: item.imageUrl,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    totalPrice: item.totalPrice,
    sellerId: item.sellerId,
    sellerStoreName: item.sellerStoreName,
    fulfillmentStatus: item.fulfillmentStatus,
    ...(item.trackingDetails ? { trackingDetails: { ...item.trackingDetails } } : {}),
  }));

  const sellerSubtotal = projectedItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const shippingAddress: SellerOrderShippingAddress = {
    fullName: order.shippingAddress?.fullName || 'Recipient',
    phoneNumber: order.shippingAddress?.phoneNumber || '',
    ...(order.shippingAddress?.alternatePhone ? { alternatePhone: order.shippingAddress.alternatePhone } : {}),
    addressLine1: order.shippingAddress?.addressLine1 || '',
    ...(order.shippingAddress?.addressLine2 ? { addressLine2: order.shippingAddress.addressLine2 } : {}),
    ...(order.shippingAddress?.landmark ? { landmark: order.shippingAddress.landmark } : {}),
    city: order.shippingAddress?.city || '',
    state: order.shippingAddress?.state || '',
    postalCode: order.shippingAddress?.postalCode || '',
    country: order.shippingAddress?.country || 'India',
  };

  const customerDetails: SellerOrderCustomerDetails = {
    name: order.customerDetails?.name || order.shippingAddress?.fullName || 'Customer',
  };

  // Keep only timeline events relevant to this seller or global lifecycle
  const statusTimeline = Array.isArray(order.statusTimeline)
    ? order.statusTimeline.filter(
        (event) =>
          event.updatedBy === 'system' ||
          event.updatedBy === sellerId ||
          event.updatedBy === order.customerId
      )
    : [];

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    orderStatus: order.orderStatus,
    paymentMethod: order.payment?.method || 'razorpay',
    paymentStatus: order.payment?.status || 'pending',
    items: projectedItems,
    sellerSubtotal,
    customerDetails,
    shippingAddress,
    statusTimeline,
  };
}

/**
 * Maps an array of orders to seller-scoped projections, excluding orders where
 * the seller has no line items.
 */
export function projectSellerOrders(orders: Order[], sellerId: string): SellerOrder[] {
  if (!Array.isArray(orders) || !sellerId) {
    return [];
  }

  const results: SellerOrder[] = [];
  for (const order of orders) {
    const projected = projectSellerOrder(order, sellerId);
    if (projected) {
      results.push(projected);
    }
  }

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
