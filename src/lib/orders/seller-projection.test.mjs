import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSellerOrder, projectSellerOrders } from './seller-projection.ts';

const mockOrder = {
  id: 'ord_shared_123',
  orderNumber: 'CAS-20261019-9876',
  customerId: 'cust_secret_account_id_456',
  customerDetails: {
    name: 'Ananya Sharma',
    email: 'ananya.confidential@example.com',
    phone: '9876543210',
  },
  shippingAddress: {
    fullName: 'Ananya Sharma',
    phoneNumber: '9876543210',
    alternatePhone: '9123456780',
    addressLine1: 'Flat 402, Lotus Towers',
    addressLine2: 'Indiranagar 100ft Road',
    landmark: 'Opposite Coffee House',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    country: 'India',
  },
  items: [
    {
      productId: 'prod_seller_a_ceramic_vase',
      variantSku: 'SKU-VASE-WHT',
      title: 'Handmade Terracotta Vase',
      slug: 'handmade-terracotta-vase',
      imageUrl: 'https://images.example.com/vase.jpg',
      unitPrice: 1500,
      quantity: 2,
      totalPrice: 3000,
      sellerId: 'seller_a_artisan',
      sellerStoreName: 'Clay & Kiln Studio',
      fulfillmentStatus: 'processing',
      trackingDetails: {
        carrier: 'BlueDart',
        trackingNumber: 'BD-123456',
      },
    },
    {
      productId: 'prod_seller_b_brass_lamp',
      variantSku: 'SKU-LAMP-GOLD',
      title: 'Heritage Brass Floor Lamp',
      slug: 'heritage-brass-floor-lamp',
      imageUrl: 'https://images.example.com/lamp.jpg',
      unitPrice: 8500,
      quantity: 1,
      totalPrice: 8500,
      sellerId: 'seller_b_metalworks',
      sellerStoreName: 'Dhokra Metalworks',
      fulfillmentStatus: 'shipped',
      trackingDetails: {
        carrier: 'Delhivery',
        trackingNumber: 'DEL-998877',
      },
    },
  ],
  sellerIds: ['seller_a_artisan', 'seller_b_metalworks'],
  pricing: {
    subtotal: 11500,
    discountAmount: 1000,
    shippingFee: 0,
    taxAmount: 525,
    totalAmount: 11025,
  },
  couponApplied: {
    code: 'FESTIVE1000',
    discountValue: 1000,
  },
  payment: {
    method: 'razorpay',
    status: 'captured',
    razorpayOrderId: 'order_secret_rzp_99999',
    razorpayPaymentId: 'pay_secret_rzp_88888',
    razorpaySignature: 'sig_secret_signature_77777',
    paidAt: '2026-10-19T06:00:00.000Z',
  },
  orderStatus: 'processing',
  cancellationReason: undefined,
  statusTimeline: [
    {
      status: 'pending',
      timestamp: '2026-10-19T05:00:00.000Z',
      note: 'Order confirmed and payment captured.',
      updatedBy: 'system',
    },
    {
      status: 'shipped',
      timestamp: '2026-10-19T05:30:00.000Z',
      note: 'Dhokra Metalworks dispatched parcel.',
      updatedBy: 'seller_b_metalworks',
    },
  ],
  createdAt: '2026-10-19T05:00:00.000Z',
  updatedAt: '2026-10-19T05:30:00.000Z',
};

test('seller A cannot obtain seller B items, SKUs, or tracking numbers', () => {
  const projectionA = projectSellerOrder(mockOrder, 'seller_a_artisan');
  assert.ok(projectionA, 'Projection for seller A should exist');

  // Should have exactly 1 item (Seller A's item)
  assert.equal(projectionA.items.length, 1);
  assert.equal(projectionA.items[0].productId, 'prod_seller_a_ceramic_vase');
  assert.equal(projectionA.items[0].sellerId, 'seller_a_artisan');
  assert.equal(projectionA.items[0].title, 'Handmade Terracotta Vase');

  // Seller B's item is NOT present in any form
  const hasSellerBItems = projectionA.items.some(
    (i) => i.sellerId === 'seller_b_metalworks' || i.productId === 'prod_seller_b_brass_lamp'
  );
  assert.equal(hasSellerBItems, false);

  // Subtotal reflects ONLY Seller A's items (₹3,000, NOT ₹11,500)
  assert.equal(projectionA.sellerSubtotal, 3000);
});

test('seller A cannot obtain shared cart pricing, discounts, coupons, or payment secrets', () => {
  const projectionA = projectSellerOrder(mockOrder, 'seller_a_artisan');
  assert.ok(projectionA);

  const rawKeys = Object.keys(projectionA);

  // Overall order pricing and coupons are stripped
  assert.equal('pricing' in projectionA, false);
  assert.equal('couponApplied' in projectionA, false);
  assert.equal(rawKeys.includes('pricing'), false);
  assert.equal(rawKeys.includes('couponApplied'), false);

  // Payment details, secrets, and gateway IDs are completely absent
  assert.equal('payment' in projectionA, false);
  assert.equal(rawKeys.includes('payment'), false);
  assert.equal(JSON.stringify(projectionA).includes('order_secret_rzp'), false);
  assert.equal(JSON.stringify(projectionA).includes('pay_secret_rzp'), false);
  assert.equal(JSON.stringify(projectionA).includes('sig_secret_signature'), false);
  assert.equal(JSON.stringify(projectionA).includes('11025'), false); // customer's total
});

test('seller A cannot obtain sensitive customer account credentials or unnecessary metadata', () => {
  const projectionA = projectSellerOrder(mockOrder, 'seller_a_artisan');
  assert.ok(projectionA);

  // Customer ID is stripped
  assert.equal('customerId' in projectionA, false);
  assert.equal(JSON.stringify(projectionA).includes('cust_secret_account_id_456'), false);

  // Customer account email is stripped from customerDetails
  assert.equal('email' in projectionA.customerDetails, false);
  assert.equal(JSON.stringify(projectionA).includes('ananya.confidential@example.com'), false);

  // Minimum fulfillment details for delivery are present
  assert.equal(projectionA.customerDetails.name, 'Ananya Sharma');
  assert.equal(projectionA.shippingAddress.fullName, 'Ananya Sharma');
  assert.equal(projectionA.shippingAddress.city, 'Bengaluru');
  assert.equal(projectionA.shippingAddress.postalCode, '560038');
  assert.equal(projectionA.shippingAddress.phoneNumber, '9876543210');
});

test('seller A timeline excludes seller B milestone notes', () => {
  const projectionA = projectSellerOrder(mockOrder, 'seller_a_artisan');
  assert.ok(projectionA);

  // System events are kept, but Seller B's internal notes are excluded
  const hasSellerBTimeline = projectionA.statusTimeline?.some(
    (event) => event.updatedBy === 'seller_b_metalworks'
  );
  assert.equal(hasSellerBTimeline, false);

  const hasSystemEvent = projectionA.statusTimeline?.some(
    (event) => event.updatedBy === 'system'
  );
  assert.equal(hasSystemEvent, true);
});

test('seller B projection isolates seller B items and subtotal', () => {
  const projectionB = projectSellerOrder(mockOrder, 'seller_b_metalworks');
  assert.ok(projectionB, 'Projection for seller B should exist');

  assert.equal(projectionB.items.length, 1);
  assert.equal(projectionB.items[0].productId, 'prod_seller_b_brass_lamp');
  assert.equal(projectionB.items[0].sellerId, 'seller_b_metalworks');
  assert.equal(projectionB.sellerSubtotal, 8500);

  // Seller A's item is NOT present
  const hasSellerAItems = projectionB.items.some(
    (i) => i.sellerId === 'seller_a_artisan'
  );
  assert.equal(hasSellerAItems, false);
});

test('a third-party seller C receives null and cannot view the shared order', () => {
  const projectionC = projectSellerOrder(mockOrder, 'seller_c_unrelated');
  assert.equal(projectionC, null);
});

test('projectSellerOrders maps an array of multi-vendor orders correctly', () => {
  const orders = [
    mockOrder,
    {
      ...mockOrder,
      id: 'ord_only_b',
      items: [mockOrder.items[1]], // only Seller B
      sellerIds: ['seller_b_metalworks'],
    },
  ];

  const resultsForA = projectSellerOrders(orders, 'seller_a_artisan');
  assert.equal(resultsForA.length, 1);
  assert.equal(resultsForA[0].id, 'ord_shared_123');

  const resultsForB = projectSellerOrders(orders, 'seller_b_metalworks');
  assert.equal(resultsForB.length, 2);
});
