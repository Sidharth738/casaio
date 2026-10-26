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
let providerRefunds = [];
let providerPostRequests = [];
let providerAmountRefunded = 0;
let providerPaymentAmount = 12_500;
class FakeRazorpay {
  constructor() {
    this.api = { rq: {
      defaults: {},
      post: async (path, body, options) => {
        providerPostRequests.push({ path, body, options });
        if (beforeRefundResponse) await beforeRefundResponse();
        const refund = { id: refundId, payment_id: paymentId, amount: 12_500, currency: 'INR', status: providerStatus, receipt: `cancel_${orderId}` };
        providerRefunds.push(refund);
        return { data: refund };
      },
    } };
    this.payments = {
      fetch: async (id) => ({ id, status: 'captured', amount: providerPaymentAmount, amount_refunded: providerAmountRefunded, currency: 'INR' }),
      fetchMultipleRefund: async () => ({ items: providerRefunds }),
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
const { POST: updateFulfillment } = await import('@/app/api/seller/orders/[orderId]/fulfillment/route');
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
let authenticatedUserId = userId;

function initialOrder(overrides = {}) {
  return {
    customerId: userId,
    orderStatus: 'confirmed',
    cancellationStatus: 'none',
    statusTimeline: [],
    items: [{ productId: 'product-local', quantity: 1, sellerId: 'seller-alpha', fulfillmentStatus: 'pending' }],
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
    collection: (name) => collection(`${path}/${name}`),
    update: async (changes) => applyUpdate(path, changes),
  };
}

function collection(path) {
  return {
    path,
    doc: (id) => ref(`${path}/${id || `attempt-${Math.random().toString(36).slice(2)}`}`),
    get: async () => ({
      empty: ![...records.keys()].some((entryPath) => entryPath.startsWith(`${path}/`)),
      docs: [...records.entries()].filter(([entryPath]) => entryPath.startsWith(`${path}/`))
        .map(([entryPath, value]) => ({ id: entryPath.split('/').at(-1), ref: ref(entryPath), exists: true, data: () => structuredClone(value) })),
    }),
    where: (field, _op, value) => ({
      limit: () => ({ get: async () => {
        const matched = [...records.entries()].find(([entryPath, order]) => entryPath === 'orders/' + orderId &&
          (field === 'payment.razorpayPaymentId'
            ? order?.payment?.razorpayPaymentId === value
            : order?.payment?.razorpayOrderId === value));
        return matched
          ? { empty: false, docs: [{ id: orderId, ref: ref(matched[0]), data: () => structuredClone(matched[1]) }] }
          : { empty: true, docs: [] };
      } }),
    }),
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
    ['users/another-customer', { role: 'customer', status: 'active' }],
    ['users/seller-alpha', { role: 'seller', status: 'active' }],
    ['sellers/seller-alpha', { status: 'approved', storeName: 'Alpha Store' }],
  ]);
  for (const [productId, product] of Object.entries(products)) {
    records.set(`products/${productId}`, structuredClone(product));
  }
  operations = [];
  queue = Promise.resolve();
  mock.method(adminAuth, 'verifySessionCookie', async (cookie) => ({
    uid: cookie === 'seller-session' ? 'seller-alpha' : authenticatedUserId,
    email: 'customer@example.invalid',
  }));
  mock.method(adminDb, 'collection', collection);
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
          if (documentRef.path.endsWith('/refundAttempts')) {
            const prefix = `${documentRef.path}/`;
            return { docs: [...records.entries()].filter(([path]) => path.startsWith(prefix))
              .map(([path, value]) => ({ id: path.split('/').at(-1), ref: ref(path), exists: true, data: () => structuredClone(value) })) };
          }
          return snapshot(records.get(documentRef.path));
        },
        create: (documentRef, value) => {
          writeStarted = true;
          operations.push(`create:${documentRef.path}`);
          writes.push(() => {
            if (records.has(documentRef.path)) throw new Error('Document already exists');
            records.set(documentRef.path, structuredClone(value));
          });
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
    attempts: () => [...records.entries()].filter(([path]) => path.startsWith(`orders/${orderId}/refundAttempts/`))
      .map(([, value]) => value),
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

function webhookRequest(event, entity, invalidSignature = false) {
  const rawBody = JSON.stringify({ event, payload: { refund: { entity } } });
  const signature = invalidSignature ? 'invalid-signature' : createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return { text: async () => rawBody, headers: { get: (name) => name === 'x-razorpay-signature' ? signature : null } };
}

function cancelRequest(session = 'local-session') {
  return { cookies: { get: (name) => name === 'casaio_session' ? { value: session } : undefined } };
}

async function deliverRefund(event, status = event === 'refund.processed' ? 'processed' : 'failed', id = refundId, overrides = {}, invalidSignature = false) {
  return paymentWebhook(webhookRequest(event, {
    id, payment_id: paymentId, amount: 12_500, currency: 'INR', status, receipt: `cancel_${orderId}`, notes: { orderId }, ...overrides,
  }, invalidSignature));
}

beforeEach(() => {
  mock.restoreAll();
  setTestConfig();
  providerStatus = 'pending';
  providerRefunds = [];
  providerPostRequests = [];
  providerAmountRefunded = 0;
  providerPaymentAmount = 12_500;
  authenticatedUserId = userId;
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

test('an early signed refund webhook requests retry and completes after the refund ID is persisted', async () => {
  const harness = createHarness();
  let earlyWebhookResponse;
  beforeRefundResponse = async () => {
    // Cancellation and attempt are reserved, but the refund ID is not persisted yet.
    earlyWebhookResponse = await deliverRefund('refund.processed');
  };
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(earlyWebhookResponse.status, 503);
  assert.equal(response.status, 202);
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.attempts()[0].state, 'provider_identified');
  assert.equal((await deliverRefund('refund.processed')).status, 200);
  const duplicateCancellation = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(duplicateCancellation.status, 200);
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().orderStatus, 'cancelled');
  assert.equal(harness.product().stock, 5);
  assert.equal(harness.attempts()[0].state, 'succeeded');
});

test('provider refund failure does not cancel the order or release inventory', async () => {
  const harness = createHarness();
  providerStatus = 'failed';
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 409);
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.order().cancellationStatus, 'failed');
  assert.equal(harness.order().payment.status, 'refund_failed');
  assert.equal(harness.product().stock, 4);
});

test('pre-shipment captured online cancellation persists a refund and restores inventory only after processed evidence', async () => {
  const harness = createHarness();
  providerStatus = 'processed';
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 200);
  assert.equal(harness.order().orderStatus, 'cancelled');
  assert.equal(harness.order().cancellationStatus, 'completed');
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().payment.razorpayRefundId, refundId);
  assert.equal(harness.product().stock, 5);
  assert.equal(harness.attempts().length, 1);
  assert.equal(harness.attempts()[0].state, 'succeeded');
  assert.equal(providerPostRequests[0].options.headers['X-Refund-Idempotency'], harness.attempts()[0].idempotencyKey);
  assert.equal(providerPostRequests[0].body, harness.attempts()[0].requestBodyJson);
});

test('a timed-out refund remains unresolved and a retry reuses the exact idempotency key and body', async () => {
  const harness = createHarness();
  beforeRefundResponse = async () => { throw new Error('synthetic network timeout'); };
  const first = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(first.status, 202);
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.order().cancellationStatus, 'processing');
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.reconciliationRequired, true);
  assert.equal(harness.product().stock, 4);
  assert.equal(harness.attempts()[0].state, 'submission_unknown');
  const firstKey = providerPostRequests[0].options.headers['X-Refund-Idempotency'];
  const firstBody = providerPostRequests[0].body;

  beforeRefundResponse = undefined;
  const retry = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(retry.status, 202);
  assert.equal(providerPostRequests.length, 2);
  assert.equal(providerPostRequests[1].options.headers['X-Refund-Idempotency'], firstKey);
  assert.equal(providerPostRequests[1].body, firstBody);
  assert.equal(harness.attempts()[0].state, 'provider_identified');
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);
});

test('an existing matching provider refund is reconciled without another submission', async () => {
  const harness = createHarness();
  providerAmountRefunded = 12_500;
  providerRefunds = [{
    id: refundId, payment_id: paymentId, amount: 12_500, currency: 'INR',
    status: 'processed', receipt: `cancel_${orderId}`,
  }];
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 200);
  assert.equal(providerPostRequests.length, 0);
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().orderStatus, 'cancelled');
  assert.equal(harness.product().stock, 5);
});

test('an unrelated prior refund fails closed for manual reconciliation', async () => {
  const harness = createHarness();
  providerAmountRefunded = 1;
  providerRefunds = [{
    id: 'rfnd_other', payment_id: paymentId, amount: 1, currency: 'INR',
    status: 'processed', receipt: 'manual-refund',
  }];
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).reconciliationRequired, true);
  assert.equal(providerPostRequests.length, 0);
  assert.equal(harness.order().payment.reconciliationReason, 'refund_balance_uncertain');
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.product().stock, 4);
});

test('a mismatch in captured payment amount fails closed before refund submission', async () => {
  const harness = createHarness();
  providerPaymentAmount = 12_499;
  const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).reconciliationRequired, true);
  assert.equal(providerPostRequests.length, 0);
  assert.equal(harness.order().payment.reconciliationReason, 'refund_balance_uncertain');
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.product().stock, 4);
});

test('shipped, delivered, uncaptured, and foreign-customer orders cannot be cancelled', async (t) => {
  for (const orderStatus of ['shipped', 'delivered']) {
    await t.test(`${orderStatus} order`, async () => {
      const harness = createHarness(initialOrder({ orderStatus }));
      const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
      assert.equal(response.status, 409);
      assert.equal(harness.order().cancellationStatus, 'none');
      assert.equal(providerPostRequests.length, 0);
    });
  }
  await t.test('uncaptured online payment', async () => {
    const harness = createHarness(initialOrder({ payment: { method: 'razorpay', status: 'pending', razorpayPaymentId: paymentId } }));
    const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
    assert.equal(response.status, 409);
    assert.equal(harness.order().cancellationStatus, 'none');
    assert.equal(providerPostRequests.length, 0);
  });
  await t.test('another customer', async () => {
    const harness = createHarness();
    authenticatedUserId = 'another-customer';
    const response = await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) });
    assert.equal(response.status, 404);
    assert.equal(harness.order().cancellationStatus, 'none');
    assert.equal(providerPostRequests.length, 0);
  });
});

test('duplicate and concurrent cancellation requests share one durable attempt', async () => {
  const harness = createHarness();
  const responses = await Promise.all([
    cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) }),
    cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) }),
  ]);
  assert.ok(responses.every((response) => response.status === 202));
  assert.equal(harness.attempts().length, 1);
  assert.ok(providerPostRequests.length >= 1 && providerPostRequests.length <= 2);
  assert.ok(providerPostRequests.every((request) => request.options.headers['X-Refund-Idempotency'] ===
    harness.attempts()[0].idempotencyKey));
  assert.ok(providerPostRequests.every((request) => request.body === harness.attempts()[0].requestBodyJson));
  assert.equal(harness.product().stock, 4);
});

test('concurrent seller fulfillment and customer cancellation cannot both win', async () => {
  const harness = createHarness();
  const fulfillmentRequest = {
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'seller-session' } : undefined },
    json: async () => ({ fulfillmentStatus: 'processing', productId: 'product-local' }),
  };
  const [cancelResponse, fulfillmentResponse] = await Promise.all([
    cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) }),
    updateFulfillment(fulfillmentRequest, { params: Promise.resolve({ orderId }) }),
  ]);
  assert.ok([200, 202, 409].includes(cancelResponse.status));
  assert.ok([200, 409].includes(fulfillmentResponse.status));
  const order = harness.order();
  const cancellationWon = order.cancellationStatus === 'processing' || order.orderStatus === 'cancelled';
  const fulfillmentWon = order.items[0].fulfillmentStatus === 'processing';
  assert.notEqual(cancellationWon && fulfillmentWon, true);
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
  assert.equal(harness.attempts()[0].state, 'succeeded');
  assert.equal(harness.attempts()[0].providerStatus, 'processed');
  assert.equal(harness.product().stock, 5);
  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal(harness.attempts()[0].state, 'succeeded');
  assert.equal(harness.product().stock, 5);
});

test('failed refund webhook ends processing without restoring inventory', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);
  assert.equal((await deliverRefund('refund.failed')).status, 200);
  assert.equal(harness.order().cancellationStatus, 'failed');
  assert.equal(harness.order().payment.status, 'refund_failed');
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.attempts()[0].state, 'failed');
  assert.equal(harness.attempts()[0].providerStatus, 'failed');
  assert.equal(harness.product().stock, 4);
});

test('duplicate and out-of-order durable refund webhooks cannot regress terminal attempt state', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);

  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal((await deliverRefund('refund.processed')).status, 200);
  assert.equal((await deliverRefund('refund.failed')).status, 200);
  assert.equal(harness.attempts()[0].state, 'succeeded');
  assert.equal(harness.attempts()[0].providerStatus, 'processed');
  assert.equal(harness.order().payment.status, 'refunded');
  assert.equal(harness.order().cancellationStatus, 'completed');
  assert.equal(harness.product().stock, 5);
});

test('durable refund webhook requires matching provider ID, payment, amount, and currency', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);

  assert.equal((await deliverRefund('refund.processed', 'processed', 'rfnd-unrelated')).status, 200);
  assert.equal((await deliverRefund('refund.processed', 'processed', refundId, { payment_id: 'pay-unrelated' })).status, 200);
  assert.equal((await deliverRefund('refund.processed', 'processed', refundId, { amount: 12_499 })).status, 409);
  assert.equal((await deliverRefund('refund.processed', 'processed', refundId, { currency: 'USD' })).status, 409);
  assert.equal((await deliverRefund('refund.processed', 'processed', refundId, { notes: { orderId: 'order-unrelated' } })).status, 409);
  assert.equal(harness.attempts()[0].state, 'provider_identified');
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);
});

test('invalid refund webhook signature cannot update a durable attempt', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);

  const response = await deliverRefund('refund.processed', 'processed', refundId, {}, true);
  assert.equal(response.status, 400);
  assert.equal(harness.attempts()[0].state, 'provider_identified');
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);
});

test('early refund events are retried while permanently unmatched payment events are acknowledged', async () => {
  const harness = createHarness(initialOrder({ cancellationStatus: 'processing' }));
  assert.equal((await deliverRefund('refund.processed')).status, 503);
  assert.equal((await deliverRefund('refund.processed', 'processed', refundId, { payment_id: 'pay-unmatched' })).status, 200);
  assert.equal(harness.order().payment.status, 'captured');
});

test('a missing active-attempt pointer cannot fall through to legacy order-only reconciliation', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);
  delete harness.order().payment.activeRefundAttemptId;

  const response = await deliverRefund('refund.processed');
  assert.equal(response.status, 503);
  assert.equal(harness.attempts()[0].state, 'provider_identified');
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);
});

test('a nonterminal attempt-state mismatch remains retryable instead of acknowledging the event', async () => {
  const harness = createHarness();
  assert.equal((await cancelOrder(cancelRequest(), { params: Promise.resolve({ orderId }) })).status, 202);
  const attempt = harness.attempts()[0];
  Object.assign(attempt, { state: 'not_submitted' });
  delete attempt.submissionStartedAt;
  delete attempt.providerRefundId;
  delete attempt.providerStatus;
  delete attempt.providerVerifiedAt;
  assert.equal((await deliverRefund('refund.processed')).status, 503);
  assert.equal(harness.order().payment.status, 'refund_pending');
  assert.equal(harness.product().stock, 4);
});
