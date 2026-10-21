import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getCouponUserUsageKey } from '@/lib/coupons/user-usage';
import { POST } from '@/app/api/seller/orders/[orderId]/fulfillment/route';

// Helper to construct a mock NextRequest
function createMockRequest(body, sessionCookie = 'mock-session-cookie') {
  return {
    cookies: {
      get: (name) => (name === 'casaio_session' && sessionCookie ? { value: sessionCookie } : undefined),
    },
    json: async () => body,
  };
}

test('route handler: rejects unauthenticated user without session cookie', async () => {
  const req = createMockRequest({ fulfillmentStatus: 'shipped' }, null);
  const params = Promise.resolve({ orderId: 'ord-100' });

  const res = await POST(req, { params });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /Seller access required/);
});

test('route handler: rejects non-approved seller before transaction', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'seller-unapproved',
    email: 'unapproved@test.com',
  }));

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ role: 'seller', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'sellers') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: 'suspended', storeName: 'Suspended Store' }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  const req = createMockRequest({ fulfillmentStatus: 'shipped' });
  const params = Promise.resolve({ orderId: 'ord-100' });

  const res = await POST(req, { params });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /approved seller profile is required/);

  mock.reset();
});

test('route handler: rejects unpaid Razorpay order inside transaction without modifying order', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'seller-alpha',
    email: 'alpha@test.com',
  }));

  const orderData = {
    id: 'ord-unpaid-rp',
    sellerIds: ['seller-alpha'],
    payment: {
      method: 'razorpay',
      status: 'pending', // Unpaid / pending
    },
    orderStatus: 'confirmed',
    items: [
      {
        productId: 'prod-1',
        title: 'Teak Table',
        sellerId: 'seller-alpha',
        fulfillmentStatus: 'pending',
      },
    ],
  };

  let transactionUpdated = false;

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ role: 'seller', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'sellers') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: 'approved', storeName: 'Alpha Store' }),
          }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        doc: () => ({ path: 'orders/ord-unpaid-rp' }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  mock.method(adminDb, 'runTransaction', async (txCallback) => {
    const mockTx = {
      get: async () => ({
        exists: true,
        data: () => orderData,
      }),
      update: () => {
        transactionUpdated = true;
      },
    };
    return txCallback(mockTx);
  });

  const req = createMockRequest({
    fulfillmentStatus: 'shipped',
    carrier: 'BlueDart',
    trackingNumber: 'BD123456',
  });
  const params = Promise.resolve({ orderId: 'ord-unpaid-rp' });

  const res = await POST(req, { params });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Payment must be captured first/);
  assert.equal(transactionUpdated, false, 'Transaction update must NEVER be called when payment check fails');

  mock.reset();
});

test('route handler: rejects unrelated seller with HTTP 403 without modifying order', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'seller-alpha',
    email: 'alpha@test.com',
  }));

  // Order belongs only to seller-beta
  const orderData = {
    id: 'ord-other-vendor',
    sellerIds: ['seller-beta'],
    payment: {
      method: 'razorpay',
      status: 'captured',
    },
    orderStatus: 'confirmed',
    items: [
      {
        productId: 'prod-beta',
        title: 'Beta Item',
        sellerId: 'seller-beta',
        fulfillmentStatus: 'pending',
      },
    ],
  };

  let transactionUpdated = false;

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ role: 'seller', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'sellers') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: 'approved', storeName: 'Alpha Store' }),
          }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        doc: () => ({ path: 'orders/ord-other-vendor' }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  mock.method(adminDb, 'runTransaction', async (txCallback) => {
    const mockTx = {
      get: async () => ({
        exists: true,
        data: () => orderData,
      }),
      update: () => {
        transactionUpdated = true;
      },
    };
    return txCallback(mockTx);
  });

  const req = createMockRequest({
    fulfillmentStatus: 'shipped',
    carrier: 'BlueDart',
    trackingNumber: 'BD999999',
  });
  const params = Promise.resolve({ orderId: 'ord-other-vendor' });

  const res = await POST(req, { params });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /Unauthorized: you are not a vendor for this order/);
  assert.equal(transactionUpdated, false, 'Transaction update must NEVER be called for unauthorized vendor');

  mock.reset();
});

test('route handler: successfully updates fulfillment for authorized seller on captured order', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'seller-alpha',
    email: 'alpha@test.com',
  }));

  const orderData = {
    id: 'ord-valid',
    sellerIds: ['seller-alpha'],
    payment: {
      method: 'razorpay',
      status: 'captured',
    },
    orderStatus: 'confirmed',
    items: [
      {
        productId: 'prod-alpha-1',
        title: 'Alpha Ceramic Pot',
        sellerId: 'seller-alpha',
        fulfillmentStatus: 'pending',
      },
    ],
  };

  let updatedData = null;

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ role: 'seller', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'sellers') {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ status: 'approved', storeName: 'Alpha Store' }),
          }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        doc: () => ({ path: 'orders/ord-valid' }),
      };
    }
    if (colName === 'notifications') {
      return {
        add: async () => ({ id: 'notif-1' }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  mock.method(adminDb, 'runTransaction', async (txCallback) => {
    const mockTx = {
      get: async () => ({
        exists: true,
        data: () => orderData,
      }),
      update: (ref, data) => {
        updatedData = data;
      },
    };
    return txCallback(mockTx);
  });

  const req = createMockRequest({
    fulfillmentStatus: 'shipped',
    carrier: 'BlueDart Express',
    trackingNumber: 'TRK-ALPHA-123',
    trackingUrl: 'https://bluedart.test/trk/123',
  });
  const params = Promise.resolve({ orderId: 'ord-valid' });

  const res = await POST(req, { params });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(updatedData);
  assert.equal(updatedData.items[0].fulfillmentStatus, 'shipped');
  assert.equal(updatedData.items[0].trackingDetails.carrier, 'BlueDart Express');
  assert.equal(updatedData.items[0].trackingDetails.trackingNumber, 'TRK-ALPHA-123');

  mock.reset();
});

test('route handler: COD delivery consumes its existing coupon slot exactly once', async () => {
  const customerId = 'customer-cod-coupon';
  const sellerId = 'seller-cod-coupon';
  const orderId = 'order-cod-coupon';
  const couponId = 'coupon-stable-id';
  const usagePath = `couponUserUsage/${getCouponUserUsageKey(couponId, customerId)}`;
  const reservationPath = `${usagePath}/reservations/${orderId}`;
  const records = new Map([
    [`users/${sellerId}`, { role: 'seller', status: 'active' }],
    [`sellers/${sellerId}`, { status: 'approved' }],
    [`orders/${orderId}`, {
      customerId,
      couponApplied: { couponId, code: 'SAVE10', discountAmount: 100 },
      payment: { method: 'cod', status: 'pending' },
      orderStatus: 'out_for_delivery',
      statusTimeline: [],
      items: [{ productId: 'p1', sellerId, title: 'Item', fulfillmentStatus: 'out_for_delivery' }],
    }],
    [usagePath, { state: 'ready', couponId, customerId, occupiedCount: 1 }],
    [reservationPath, { orderId, couponId, customerId, paymentMethod: 'cod', state: 'awaiting_delivery' }],
  ]);
  const ref = (path) => ({
    id: path.split('/').at(-1), path,
    get: async () => ({ exists: records.has(path), data: () => structuredClone(records.get(path)) }),
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: sellerId, email: 'seller@example.invalid' }));
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id) => ref(`${name}/${id}`),
    add: async () => ({ id: 'notification-local' }),
  }));
  mock.method(adminDb, 'runTransaction', async (callback) => callback({
    get: async (documentRef) => ({ exists: records.has(documentRef.path), data: () => structuredClone(records.get(documentRef.path)) }),
    update: (documentRef, changes) => records.set(documentRef.path, { ...(records.get(documentRef.path) || {}), ...changes }),
  }));

  const params = Promise.resolve({ orderId });
  const response = await POST(createMockRequest({ fulfillmentStatus: 'delivered' }), { params });
  assert.equal(response.status, 200);
  assert.equal(records.get(usagePath).occupiedCount, 1);
  assert.equal(records.get(reservationPath).state, 'consumed');
  const duplicate = await POST(createMockRequest({ fulfillmentStatus: 'delivered' }), { params });
  assert.equal(duplicate.status, 200);
  assert.equal(records.get(usagePath).occupiedCount, 1);
  assert.equal(records.get(reservationPath).state, 'consumed');
  mock.restoreAll();
});
