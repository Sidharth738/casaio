import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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
