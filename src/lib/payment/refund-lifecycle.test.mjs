import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Module from 'node:module';
import { resolve } from 'node:path';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
let providerStatus = 'pending';
let beforeRefundResponse;
class FakeRazorpay {
  constructor() {
    this.api = { rq: { defaults: {} } };
    this.payments = {
      fetchMultipleRefund: async () => ({ items: [] }),
      refund: async () => {
        if (beforeRefundResponse) await beforeRefundResponse();
        return { id: refundId, status: providerStatus };
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
const { POST: paymentWebhook } = await import('@/app/api/payment/webhook/route');
const { POST: cancelOrder } = await import('@/app/api/orders/[orderId]/cancel/route');
Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

const orderId = 'order-refund-local';
const userId = 'customer-refund-local';
const paymentId = 'pay_refund_local';
const razorpayOrderId = 'order_refund_local';
const refundId = 'rfnd_refund_local';
const keySecret = 'fake-local-key-secret';
const webhookSecret = 'fake-local-webhook-secret';
let records;
let operations;
let queue;

function initialOrder(overrides = {}) {
  return {
    customerId: userId,
    orderStatus: 'confirmed',
    cancellationStatus: 'none',
    statusTimeline: [],
    items: [{ productId: 'product-local', quantity: 1, fulfillmentStatus: 'pending' }],
    pricing: { totalAmount: 125 },
    payment: {
      method: 'razorpay', status: 'captured', razorpayOrderId,
      razorpayPaymentId: paymentId,
    },
    ...overrides,
  };
}

function snapshot(data) {
  return { exists: data !== undefined, data: () => data && structuredClone(data) };
}

function ref(path) {
  return {
    id: path.split('/').at(-1),
    path,
    get: async () => snapshot(records.get(path)),
    update: async (changes) => applyUpdate(path, changes),
  };
}

function applyUpdate(path, changes) {
  const value = structuredClone(records.get(path) || {});
  for (const [key, entry] of Object.entries(changes)) {
    const parts = key.split('.');
    let target = value;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    target[parts.at(-1)] = entry;
  }
  records.set(path, value);
}

function createHarness(order = initialOrder(), products = { 'product-local': { stock: 4, salesCount: 1 } }) {
  records = new Map([
    [`orders/${orderId}`, structuredClone(order)],
    [`checkoutRequests/_active_razorpay_${userId}`, { orderId }],
    [`checkoutRequests/_checkout_coord_${userId}`, { orderId }],
    [`users/${userId}`, { role: 'customer', status: 'active' }],
  ]);
  for (const [productId, product] of Object.entries(products)) {
    records.set(`products/${productId}`, structuredClone(product));
  }
  operations = [];
  queue = Promise.resolve();
  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: userId, email: 'customer@example.invalid' }));
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id) => ref(`${name}/${id}`),
    where: (field, _op, value) => ({
      limit: () => ({ get: async () => {
        const order = records.get(`orders/${orderId}`);
        const actual = field === 'payment.razorpayPaymentId'
          ? order?.payment?.razorpayPaymentId
          : order?.payment?.razorpayOrderId;
        return actual === value
          ? { empty: false, docs: [{ ref: ref(`orders/${orderId}`), data: () => structuredClone(order) }] }
          : { empty: true, docs: [] };
      } }),
    }),
  }));
  mock.method(adminDb, 'runTransaction', (callback) => {
    // The fake serializes callbacks to model committed transaction ordering.
    // It does not emulate Firestore's optimistic conflict detection/retries.
    const execution = queue.then(async () => {
      let writeStarted = false;
      const writes = [];
      const tx = {
        get: async (documentRef) => {
          assert.equal(writeStarted, false, `read ${documentRef.path} after first write`);
          operations.push(`get:${documentRef.path}`);
          return snapshot(records.get(documentRef.path));
        },
        update: (documentRef, changes) => {
          writeStarted = true;
          operations.push(`update:${documentRef.path}`);
          writes.push(() => applyUpdate(documentRef.path, changes));
        },
        delete: (documentRef) => {
          writeStarted = true;
          operations.push(`delete:${documentRef.path}`);
          writes.push(() => records.delete(documentRef.path));
        },
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    });
    queue = execution.then(() => undefined, () => undefined);
    return execution;
  });
  return {
    order: () => records.get(`orders/${orderId}`),
    product: (productId = 'product-local') => records.get(`products/${productId}`),
  };
}

function setTestConfig() {
  process.env.NODE_ENV = 'test';
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED = 'false';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_local_key';
  process.env.RAZORPAY_KEY_SECRET = keySecret;
  process.env.RAZORPAY_KEY_SECRET_MODE = 'test';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  process.env.RAZORPAY_WEBHOOK_SECRET_MODE = 'test';
}

function webhookRequest(event, entity) {
  const rawBody = JSON.stringify({ event, payload: { refund: { entity } } });
  const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return { text: async () => rawBody, headers: { get: (name) => name === 'x-razorpay-signature' ? signature : null } };
}

function cancelRequest() {
  return { cookies: { get: (name) => name === 'casaio_session' ? { value: 'local-session' } : undefined } };
}

async function deliverRefund(event, status = event === 'refund.processed' ? 'processed' : 'failed', id = refundId) {
  return paymentWebhook(webhookRequest(event, { id, payment_id: paymentId, status }));
}

beforeEach(() => {
  mock.restoreAll();
  setTestConfig();
  providerStatus = 'pending';
  beforeRefundResponse = undefined;
});

test('refund webhook persists processed state and performs its read before its write', async () => {
  const harness = createHarness(initialOrder({ cancellationStatus: 'processing', payment: {
    method: 'razorpay', status: 'refund_pending', razorpayOrderId, razorpayPaymentId: paymentId, razorpayRefundId: refundId,
  } }));
  const response = await deliverRefund('refund.processed');
  assert.equal(response.status, 200);
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().orderStatus, 'cancelled');
  const firstWrite = operations.findIndex((operation) => operation.startsWith('update:') || operation.startsWith('delete:'));
  assert.ok(operations.slice(0, firstWrite).includes('get:products/product-local'));
  assert.ok(operations.slice(firstWrite).some((operation) => operation.startsWith(`update:orders/${orderId}`)));
});

test('late failed delivery and duplicate processed delivery cannot downgrade or duplicate refund fulfillment', async () => {
  const harness = createHarness(initialOrder({ payment: {
    method: 'razorpay', status: 'refunded', razorpayOrderId, razorpayPaymentId: paymentId, razorpayRefundId: refundId,
  } }));
  assert.equal((await deliverRefund('refund.failed')).status, 200);
  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(operations.filter((entry) => entry.startsWith('update:')).length, 0);
});

test('concurrent processed and failed refund deliveries converge on refunded', async () => {
  const harness = createHarness(initialOrder({ payment: {
    method: 'razorpay', status: 'refund_pending', razorpayOrderId, razorpayPaymentId: paymentId, razorpayRefundId: refundId,
  } }));
  const [processed, failed] = await Promise.all([
    deliverRefund('refund.processed'),
    deliverRefund('refund.failed'),
  ]);
  assert.equal(processed.status, 200);
  assert.equal(failed.status, 200);
  assert.equal(harness.order().payment.status, 'refunded');
});

test('refund events arriving before the cancellation transaction stores the refund ID are retried', async () => {
  const harness = createHarness(initialOrder({ cancellationStatus: 'processing' }));
  const response = await deliverRefund('refund.processed');
  assert.equal(response.status, 503);
  assert.equal(harness.order().payment.status, 'captured');
});

test('cancellation preserves a processed webhook state when the provider response is stale pending', async () => {
  const harness = createHarness();
  beforeRefundResponse = async () => {
    // Simulate Razorpay delivering the webhook before the refund API response
    // is returned to the cancellation handler.
    const reserve = await adminDb.runTransaction(async (tx) => {
      const orderRef = ref(`orders/${orderId}`);
      const snap = await tx.get(orderRef);
      tx.update(orderRef, { cancellationStatus: 'processing', 'payment.razorpayRefundId': refundId, 'payment.status': 'refund_pending' });
      return snap.exists;
    });
    assert.equal(reserve, true);
    assert.equal((await deliverRefund('refund.processed')).status, 200);
  };
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).paymentStatus, 'refunded');
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().orderStatus, 'cancelled');
  assert.equal(harness.product().stock, 5);
});

test('provider refund failure does not cancel the order or release inventory', async () => {
  const harness = createHarness();
  providerStatus = 'failed';
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 502);
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.order().cancellationStatus, 'failed');
  assert.equal(harness.order().payment.status, 'refund_failed');
  assert.equal(harness.product().stock, 4);
});

function codOrder(items, overrides = {}) {
  return initialOrder({
    orderStatus: 'pending',
    payment: { method: 'cod', status: 'pending' },
    items: items.map((item) => ({ fulfillmentStatus: 'pending', ...item })),
    ...overrides,
  });
}

test('COD cancellation restores one simple product and a second request cannot restore it again', async () => {
  const harness = createHarness(codOrder([{ productId: 'simple', quantity: 2 }]), {
    simple: { stock: 3, salesCount: 5, status: 'active' },
  });
  const first = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(first.status, 200);
  assert.equal(harness.product('simple').stock, 5);
  assert.equal(harness.product('simple').salesCount, 3);
  const second = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(second.status, 200);
  assert.equal(harness.product('simple').stock, 5);
});

test('concurrent COD cancellation requests restore inventory exactly once', async () => {
  const harness = createHarness(codOrder([{ productId: 'simple', quantity: 2 }]), {
    simple: { stock: 3, salesCount: 2, status: 'active' },
  });
  const responses = await Promise.all([
    cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) }),
    cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) }),
  ]);
  assert.ok(responses.every((response) => response.status === 200 || response.status === 409));
  assert.equal(harness.product('simple').stock, 5);
  assert.equal(harness.order().cancellationStatus, 'completed');
});

test('repeated product lines restore combined parent stock and sales count once', async () => {
  const harness = createHarness(codOrder([
    { productId: 'simple', quantity: 2 },
    { productId: 'simple', quantity: 3 },
  ]), { simple: { stock: 4, salesCount: 8, status: 'active' } });
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 200);
  assert.equal(harness.product('simple').stock, 9);
  assert.equal(harness.product('simple').salesCount, 3);
  assert.equal(operations.filter((operation) => operation === 'get:products/simple').length, 1);
});

test('multiple variants and repeated variant lines restore SKU stock, parent aggregate, and leave other variants unchanged', async () => {
  const harness = createHarness(codOrder([
    { productId: 'chair', variantSku: 'CHAIR-A', quantity: 1 },
    { productId: 'chair', variantSku: 'CHAIR-A', quantity: 2 },
    { productId: 'chair', variantSku: 'CHAIR-B', quantity: 4 },
  ]), {
    chair: {
      stock: 10,
      salesCount: 12,
      hasVariants: true,
      variants: [
        { sku: 'CHAIR-A', title: 'A', stock: 2, price: 10, attributes: { color: 'red' } },
        { sku: 'CHAIR-B', title: 'B', stock: 1, price: 11, attributes: { color: 'blue' } },
        { sku: 'CHAIR-C', title: 'C', stock: 7, price: 12, attributes: { color: 'green' } },
      ],
    },
  });
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 200);
  const product = harness.product('chair');
  assert.equal(product.stock, 17);
  assert.equal(product.salesCount, 5);
  assert.deepEqual(product.variants.map(({ sku, stock }) => [sku, stock]), [
    ['CHAIR-A', 5], ['CHAIR-B', 5], ['CHAIR-C', 7],
  ]);
  assert.deepEqual(product.variants[0].attributes, { color: 'red' });
  const productReadIndex = operations.lastIndexOf('get:products/chair');
  const firstCompletionWrite = operations.findIndex((operation, index) => index > productReadIndex &&
    (operation.startsWith('update:') || operation.startsWith('delete:')));
  assert.ok(productReadIndex >= 0);
  assert.ok(firstCompletionWrite > productReadIndex);
});

test('cancellation preserves manually inactive and out-of-stock product statuses', async () => {
  for (const status of ['archived', 'out_of_stock']) {
    const harness = createHarness(codOrder([{ productId: 'simple', quantity: 1 }]), {
      simple: { stock: 0, salesCount: 1, status },
    });
    const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
    assert.equal(response.status, 200);
    assert.equal(harness.product('simple').stock, 1);
    assert.equal(harness.product('simple').status, status);
  }
});

test('pending refund holds cancellation and inventory until processed webhook, then restores once', async () => {
  const harness = createHarness();
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 202);
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.order().cancellationStatus, 'processing');
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);

  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal(harness.order().orderStatus, 'cancelled');
  assert.equal(harness.order().cancellationStatus, 'completed');
  assert.equal(harness.product().stock, 5);
  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal(harness.product().stock, 5);
});

test('failed refund webhook ends processing without restoring inventory', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);
  assert.equal((await deliverRefund('refund.failed')).status, 200);
  assert.equal(harness.order().cancellationStatus, 'failed');
  assert.equal(harness.order().payment.status, 'refund_failed');
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.product().stock, 4);
});
