import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const customerId = 'local-customer';
const orderId = 'local-gst-order';
const createdGatewayOrders = [];
let testDocuments;

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
class FakeRazorpay {
  constructor() {
    this.api = { rq: { defaults: {} } };
    this.orders = {
      all: async () => ({ items: [] }),
      create: async (request) => {
        createdGatewayOrders.push(request);
        return { id: 'order_test_local', ...request, status: 'created' };
      },
    };
  }
}
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
Module._load = function (request, ...args) {
  if (request === 'razorpay') return FakeRazorpay;
  return originalLoad.call(this, request, ...args);
};
const { POST } = await import('@/app/api/payment/create-order/route');
Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

function setFakeTestConfiguration() {
  process.env.NODE_ENV = 'test';
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED = 'false';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_order_route';
  process.env.RAZORPAY_KEY_SECRET = 'fake-order-route-secret';
  process.env.RAZORPAY_KEY_SECRET_MODE = 'test';
}

beforeEach(() => {
  mock.restoreAll();
  setFakeTestConfiguration();
  createdGatewayOrders.length = 0;

  const order = {
    customerId,
    pricing: { totalAmount: 1180.01, subtotal: 1180.01, taxAmount: 180, taxRate: 0.18 },
    payment: { method: 'razorpay', status: 'pending' },
  };
  const activeAttempt = { orderId };
  const documents = new Map([
    [`orders/${orderId}`, order],
    [`checkoutRequests/_active_razorpay_${customerId}`, activeAttempt],
    [`users/${customerId}`, { role: 'customer', status: 'active' }],
  ]);
  const makeRef = (path) => ({
    id: path.split('/').at(-1),
    path,
    get: async () => {
      const data = documents.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  });

  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: customerId, email: 'local@example.invalid' }));
  mock.method(adminDb, 'collection', (collectionName) => ({
    doc: (id) => makeRef(`${collectionName}/${id}`),
  }));
  mock.method(adminDb, 'runTransaction', async (callback) => callback({
    get: async (ref) => {
      const data = documents.get(ref.path);
      return { exists: data !== undefined, data: () => data };
    },
    update: (ref, updates) => {
      const data = documents.get(ref.path);
      for (const [key, value] of Object.entries(updates)) {
        const parts = key.split('.');
        let target = data;
        for (const part of parts.slice(0, -1)) target = target[part] ??= {};
        target[parts.at(-1)] = value;
      }
    },
  }));

  testDocuments = documents;
});

test('Razorpay receives the persisted GST-inclusive total converted exactly to paise', async () => {
  const response = await POST({
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'fake-session' } : undefined },
    json: async () => ({ orderId }),
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(createdGatewayOrders.length, 1);
  assert.equal(createdGatewayOrders[0].amount, 118001);
  assert.equal(data.amount, 118001);
  assert.equal(data.pricing.totalAmount, 1180.01);
  assert.equal(data.pricing.taxAmount, 180);
  assert.equal(testDocuments.get(`orders/${orderId}`).payment.razorpayOrderId, 'order_test_local');
});
