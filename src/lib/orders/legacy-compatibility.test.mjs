import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSellerParticipantInOrder,
  deriveSellerIdsFromItems,
  mergeLegacyOrders,
} from './legacy-compatibility.ts';
import { projectSellerOrder, projectSellerOrders } from './seller-projection.ts';

test('isSellerParticipantInOrder authorizes participants correctly', () => {
  // 1. Modern order with sellerIds array
  const modernOrder = {
    id: 'ord-1',
    sellerIds: ['seller-alpha', 'seller-beta'],
    items: [
      { sellerId: 'seller-alpha', productId: 'p1' },
      { sellerId: 'seller-beta', productId: 'p2' },
    ],
  };

  assert.equal(isSellerParticipantInOrder(modernOrder, 'seller-alpha'), true);
  assert.equal(isSellerParticipantInOrder(modernOrder, 'seller-beta'), true);
  assert.equal(isSellerParticipantInOrder(modernOrder, 'seller-gamma'), false);

  // 2. Legacy order without sellerIds array
  const legacyOrder = {
    id: 'ord-legacy-1',
    items: [
      { sellerId: 'seller-alpha', productId: 'p1' },
    ],
  };

  assert.equal(isSellerParticipantInOrder(legacyOrder, 'seller-alpha'), true);
  assert.equal(isSellerParticipantInOrder(legacyOrder, 'seller-gamma'), false);

  // 3. Absent sellerIds never grants unauthorized access
  const legacyOrderNoMatch = {
    id: 'ord-legacy-2',
    items: [
      { sellerId: 'seller-other', productId: 'p3' },
    ],
  };
  assert.equal(isSellerParticipantInOrder(legacyOrderNoMatch, 'seller-alpha'), false);

  // 4. Edge cases: null, undefined, empty sellerId, no items
  assert.equal(isSellerParticipantInOrder(null, 'seller-alpha'), false);
  assert.equal(isSellerParticipantInOrder(undefined, 'seller-alpha'), false);
  assert.equal(isSellerParticipantInOrder(legacyOrder, ''), false);
  assert.equal(isSellerParticipantInOrder({ id: 'empty' }, 'seller-alpha'), false);
});

test('deriveSellerIdsFromItems extracts and deduplicates valid seller IDs', () => {
  const items = [
    { sellerId: 'seller-1' },
    { sellerId: 'seller-2' },
    { sellerId: 'seller-1' }, // duplicate
    { sellerId: '  seller-3  ' }, // whitespace
    { sellerId: '' }, // empty
    {}, // missing
  ];

  const derived = deriveSellerIdsFromItems(items);
  assert.deepEqual(derived, ['seller-1', 'seller-2', 'seller-3']);

  assert.deepEqual(deriveSellerIdsFromItems(null), []);
  assert.deepEqual(deriveSellerIdsFromItems(undefined), []);
  assert.deepEqual(deriveSellerIdsFromItems([]), []);
});

test('mergeLegacyOrders merges only participating non-duplicate orders and sorts descending', () => {
  const primaryOrders = [
    {
      id: 'ord-2',
      createdAt: '2026-03-02T10:00:00.000Z',
      sellerIds: ['seller-1'],
      items: [{ sellerId: 'seller-1', productId: 'p2' }],
    },
  ];

  const candidateLegacyOrders = [
    {
      id: 'ord-3',
      createdAt: '2026-03-03T10:00:00.000Z', // newest
      items: [{ sellerId: 'seller-1', productId: 'p3' }],
    },
    {
      id: 'ord-2', // duplicate of primary
      createdAt: '2026-03-02T10:00:00.000Z',
      items: [{ sellerId: 'seller-1', productId: 'p2' }],
    },
    {
      id: 'ord-unrelated', // not for seller-1
      createdAt: '2026-03-04T10:00:00.000Z',
      items: [{ sellerId: 'seller-other', productId: 'pX' }],
    },
    {
      id: 'ord-1',
      createdAt: '2026-03-01T10:00:00.000Z', // oldest
      items: [{ sellerId: 'seller-1', productId: 'p1' }],
    },
  ];

  const merged = mergeLegacyOrders(primaryOrders, candidateLegacyOrders, 'seller-1');

  // Should include ord-3, ord-2, ord-1, and EXCLUDE ord-unrelated
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, 'ord-3');
  assert.equal(merged[1].id, 'ord-2');
  assert.equal(merged[2].id, 'ord-1');
});

test('multi-vendor privacy: Seller A cannot access Seller B items, pricing, or payment secrets', () => {
  const multiVendorOrder = {
    id: 'ord-shared-123',
    orderNumber: 'CAS-2026-999',
    customerId: 'cust-xyz',
    customerDetails: {
      name: 'Priya Sharma',
      email: 'priya.sharma@private-domain.test',
      phone: '+919876543210',
    },
    shippingAddress: {
      fullName: 'Priya Sharma',
      phoneNumber: '+919876543210',
      addressLine1: '42 Lotus Boulevard, Apt 5B',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    items: [
      {
        productId: 'prod-teak-table',
        title: 'Artisan Teak Table',
        slug: 'artisan-teak-table',
        imageUrl: '/images/table.jpg',
        unitPrice: 25000,
        quantity: 1,
        totalPrice: 25000,
        sellerId: 'seller-alpha',
        sellerStoreName: 'Alpha Furnishings',
        fulfillmentStatus: 'pending',
      },
      {
        productId: 'prod-ceramic-vase',
        title: 'Handcrafted Ceramic Vase',
        slug: 'handcrafted-ceramic-vase',
        imageUrl: '/images/vase.jpg',
        unitPrice: 4000,
        quantity: 2,
        totalPrice: 8000,
        sellerId: 'seller-beta',
        sellerStoreName: 'Beta Ceramics',
        fulfillmentStatus: 'pending',
      },
    ],
    pricing: {
      subtotal: 33000,
      tax: 5940,
      shipping: 0,
      discount: 2000,
      total: 36940,
      couponCode: 'PRIVATE_VIP_2000',
    },
    payment: {
      method: 'razorpay',
      status: 'captured',
      razorpayOrderId: 'order_secret_rp_123',
      razorpayPaymentId: 'pay_secret_rp_456',
      signature: 'secret_hmac_sig',
    },
    orderStatus: 'confirmed',
    createdAt: '2026-03-01T12:00:00.000Z',
    statusTimeline: [
      {
        status: 'confirmed',
        timestamp: '2026-03-01T12:00:00.000Z',
        note: 'Order confirmed',
        updatedBy: 'system',
      },
      {
        status: 'processing',
        timestamp: '2026-03-01T13:00:00.000Z',
        note: 'Alpha internal workshop note',
        updatedBy: 'seller-alpha',
      },
      {
        status: 'processing',
        timestamp: '2026-03-01T13:05:00.000Z',
        note: 'Beta pottery studio note',
        updatedBy: 'seller-beta',
      },
    ],
  };

  // Seller Alpha projection
  const alphaView = projectSellerOrder(multiVendorOrder, 'seller-alpha');
  assert.ok(alphaView);
  assert.equal(alphaView.items.length, 1);
  assert.equal(alphaView.items[0].productId, 'prod-teak-table');
  assert.equal(alphaView.sellerSubtotal, 25000);

  // Proves Seller B's items are completely excluded
  assert.equal(alphaView.items.some((i) => i.productId === 'prod-ceramic-vase'), false);
  assert.equal(alphaView.items.some((i) => i.sellerId === 'seller-beta'), false);

  // Proves total order financial secrets and payment keys are excluded
  assert.equal(alphaView.pricing, undefined);
  assert.equal(alphaView.payment, undefined);
  assert.equal(alphaView.customerDetails.email, undefined);
  assert.equal(alphaView.customerDetails.phone, undefined);

  // Proves Seller B's internal timeline notes are excluded
  assert.equal(
    alphaView.statusTimeline.some((t) => t.updatedBy === 'seller-beta'),
    false
  );
  assert.equal(
    alphaView.statusTimeline.some((t) => t.updatedBy === 'seller-alpha'),
    true
  );

  // Seller Beta projection
  const betaView = projectSellerOrder(multiVendorOrder, 'seller-beta');
  assert.ok(betaView);
  assert.equal(betaView.items.length, 1);
  assert.equal(betaView.items[0].productId, 'prod-ceramic-vase');
  assert.equal(betaView.sellerSubtotal, 8000);
  assert.equal(betaView.items.some((i) => i.sellerId === 'seller-alpha'), false);

  // Unrelated Seller Gamma receives null
  const gammaView = projectSellerOrder(multiVendorOrder, 'seller-gamma');
  assert.equal(gammaView, null);

  // Batch projection with projectSellerOrders excludes non-participating orders
  const batchList = projectSellerOrders([multiVendorOrder], 'seller-alpha');
  assert.equal(batchList.length, 1);
  assert.equal(batchList[0].id, 'ord-shared-123');

  const emptyBatch = projectSellerOrders([multiVendorOrder], 'seller-gamma');
  assert.equal(emptyBatch.length, 0);
});

