import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import Module from 'node:module';
import { resolve } from 'node:path';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getCouponUserUsageKey } from '@/lib/coupons/user-usage';

// Next resolves the server-only marker through its bundler. Point the unit-test
// loader at Next's empty server marker so importing the real handlers stays local.
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
class FakeRazorpay {
  constructor() {
    this.api = { rq: { defaults: {} } };
    this.payments = {
      fetch: async (id) => ({
        id,
        order_id: razorpayOrderId,
        amount: 12500,
        currency: 'INR',
        status: 'captured',
        ...gatewayPaymentOverride,
      }),
    };
    this.orders = {
      fetch: async (id) => ({ id, amount: 12500, currency: 'INR' }),
      fetchPayments: async () => ({ items: [{
        id: paymentId,
        order_id: razorpayOrderId,
        amount: 12500,
        currency: 'INR',
        status: 'captured',
      }] }),
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
const { POST: verifyPayment } = await import('@/app/api/payment/verify/route');
const { POST: paymentWebhook } = await import('@/app/api/payment/webhook/route');
const { GET: checkPaymentAttempt } = await import('@/app/api/payment/attempt/route');
Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

const orderId = 'order-local-1';
const userId = 'customer-local-1';
const razorpayOrderId = 'order_test_local-1';
const paymentId = 'pay_local-1';
const webhookSecret = 'fake-local-webhook-secret';
const keySecret = 'fake-local-key-secret';
let gatewayPaymentOverride;

function setWebhookTestMode() {
  process.env.NODE_ENV = 'test';
  process.env.RAZORPAY_MODE = 'test';
  process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED = 'false';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_local_key';
  process.env.RAZORPAY_KEY_SECRET = keySecret;
  process.env.RAZORPAY_KEY_SECRET_MODE = 'test';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  process.env.RAZORPAY_WEBHOOK_SECRET_MODE = 'test';
}

function paymentSignature(order = razorpayOrderId, id = paymentId) {
  return createHmac('sha256', keySecret).update(`${order}|${id}`).digest('hex');
}

function initialOrder(overrides = {}) {
  return {
    customerId: userId,
    orderStatus: 'pending',
    statusTimeline: [],
    pricing: { totalAmount: 125 },
    payment: {
      method: 'razorpay',
      status: 'pending',
      razorpayOrderId,
    },
    ...overrides,
  };
}

function createHarness({ order = initialOrder(), activeAttempt = { orderId, userId }, capturePaymentId = paymentId } = {}) {
  const couponId = order.couponApplied?.couponId;
  const usagePath = couponId ? `couponUserUsage/${getCouponUserUsageKey(couponId, userId)}` : null;
  const records = new Map([
    [`orders/${orderId}`, structuredClone(order)],
    [`checkoutRequests/_active_razorpay_${userId}`, structuredClone(activeAttempt)],
    [`users/${userId}`, { role: 'customer', status: 'active' }],
    ...(usagePath ? [
      [usagePath, { state: 'ready', couponId, customerId: userId, occupiedCount: 1 }],
      [`${usagePath}/reservations/${orderId}`, {
        orderId, couponId, customerId: userId, paymentMethod: 'razorpay', state: 'reserved',
      }],
    ] : []),
  ]);
  const operations = [];
  let queue = Promise.resolve();

  const ref = (path) => ({
    id: path.split('/').at(-1),
    path,
    get: async () => snapshot(records.get(path)),
    update: async (changes) => applyUpdate(path, changes),
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  const snapshot = (data) => ({ exists: data !== undefined, data: () => data && structuredClone(data) });
  const applyUpdate = (path, changes) => {
    const current = structuredClone(records.get(path) || {});
    for (const [field, value] of Object.entries(changes)) {
      const parts = field.split('.');
      let target = current;
      for (const part of parts.slice(0, -1)) target = target[part] ??= {};
      target[parts.at(-1)] = value;
    }
    records.set(path, current);
  };

  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: userId, email: 'customer@example.invalid' }));
  mock.method(adminDb, 'collection', (collectionName) => ({
    doc: (id) => ref(`${collectionName}/${id}`),
    where: (field, _operator, value) => ({
      limit: () => ({
        get: async () => {
          if (collectionName !== 'orders' || field !== 'payment.razorpayOrderId' || value !== razorpayOrderId) {
            return { empty: true, docs: [] };
          }
          return {
            empty: false,
            docs: [{ ref: ref(`orders/${orderId}`), data: () => structuredClone(records.get(`orders/${orderId}`)) }],
          };
        },
      }),
    }),
  }));

  mock.method(adminDb, 'runTransaction', (callback) => {
    const execution = queue.then(async () => {
      let writeStarted = false;
      const writes = [];
      const transaction = {
        get: async (documentRef) => {
          assert.equal(writeStarted, false, `transaction read ${documentRef.path} after its first write`);
          operations.push({ type: 'get', path: documentRef.path });
          return snapshot(records.get(documentRef.path));
        },
        update: (documentRef, changes) => {
          writeStarted = true;
          operations.push({ type: 'update', path: documentRef.path });
          writes.push(() => applyUpdate(documentRef.path, changes));
        },
        delete: (documentRef) => {
          writeStarted = true;
          operations.push({ type: 'delete', path: documentRef.path });
          writes.push(() => records.delete(documentRef.path));
        },
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    });
    queue = execution.then(() => undefined, () => undefined);
    return execution;
  });

  return {
    records,
    operations,
    order: () => records.get(`orders/${orderId}`),
    attempt: () => records.get(`checkoutRequests/_active_razorpay_${userId}`),
    capturePaymentId,
    couponUsage: () => usagePath ? records.get(usagePath) : undefined,
    couponReservation: () => usagePath ? records.get(`${usagePath}/reservations/${orderId}`) : undefined,
  };
}

function verificationRequest(body) {
  return {
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'fake-session' } : undefined },
    json: async () => body,
  };
}

function signedWebhook(body) {
  const rawBody = JSON.stringify(body);
  const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return {
    text: async () => rawBody,
    headers: { get: (name) => name === 'x-razorpay-signature' ? signature : null },
  };
}

function capturedWebhook(payment = {}) {
  return {
    event: 'payment.captured',
    payload: { payment: { entity: {
      id: paymentId,
      order_id: razorpayOrderId,
      amount: 12500,
      currency: 'INR',
      status: 'captured',
      ...payment,
    } } },
  };
}

beforeEach(() => {
  mock.restoreAll();
  setWebhookTestMode();
  gatewayPaymentOverride = undefined;
});

test('client verification persists a capture and clears its active attempt', async () => {
  const harness = createHarness();
  const response = await verifyPayment(verificationRequest({
    orderId,
    razorpayOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: paymentSignature(),
  }));

  assert.equal(response.status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.razorpayPaymentId, paymentId);
  assert.equal(harness.attempt(), undefined);
  assert.deepEqual(harness.operations.map(({ type }) => type), ['get', 'get', 'update', 'delete']);
});

test('capture webhook persists a capture and clears its active attempt', async () => {
  const harness = createHarness({ order: initialOrder({ payment: { method: 'razorpay', status: 'pending', razorpayOrderId } }) });
  const response = await paymentWebhook(signedWebhook(capturedWebhook()));

  assert.equal(response.status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.razorpayPaymentId, paymentId);
  assert.equal(harness.attempt(), undefined);
  const transactionOps = harness.operations;
  assert.deepEqual(transactionOps.map(({ type }) => type), ['get', 'get', 'update', 'delete']);
});

test('verification and webhook transition the same online slot to consumed without incrementing it twice', async () => {
  const harness = createHarness({ order: initialOrder({
    couponApplied: { couponId: 'coupon-snapshot-1', code: 'SAVE10', discountAmount: 100 },
  }) });
  const verification = await verifyPayment(verificationRequest({
    orderId,
    razorpayOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: paymentSignature(),
  }));
  assert.equal(verification.status, 200);
  assert.equal(harness.couponUsage().occupiedCount, 1);
  assert.equal(harness.couponReservation().state, 'consumed');

  const webhook = await paymentWebhook(signedWebhook(capturedWebhook()));
  assert.equal(webhook.status, 200);
  assert.equal(harness.couponUsage().occupiedCount, 1);
  assert.equal(harness.couponReservation().state, 'consumed', JSON.stringify(harness.operations));
});

test('payment-attempt reconciliation consumes an existing online slot without incrementing it', async () => {
  const harness = createHarness({ order: initialOrder({
    payment: { method: 'razorpay', status: 'captured', razorpayOrderId, razorpayPaymentId: paymentId },
    couponApplied: { couponId: 'coupon-snapshot-1', code: 'SAVE10', discountAmount: 100 },
  }) });
  const response = await checkPaymentAttempt({
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'fake-session' } : undefined },
  });
  assert.equal(response.status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.couponUsage().occupiedCount, 1);
  assert.equal(harness.couponReservation().state, 'consumed');
});

test('duplicate verification and webhook capture events do not duplicate capture or fulfillment', async () => {
  setWebhookTestMode();
  const harness = createHarness();
  const verification = () => verifyPayment(verificationRequest({
    orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: paymentSignature(),
  }));
  const webhook = () => paymentWebhook(signedWebhook(capturedWebhook()));

  assert.equal((await verification()).status, 200);
  assert.equal((await verification()).status, 200);
  assert.equal((await webhook()).status, 200);
  assert.equal((await webhook()).status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().statusTimeline.length, 1);
  assert.equal(harness.attempt(), undefined);
});

test('concurrent verification and webhook captures converge on one captured state', async () => {
  const harness = createHarness();
  const [verifyResponse, webhookResponse] = await Promise.all([
    verifyPayment(verificationRequest({
      orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: paymentSignature(),
    })),
    paymentWebhook(signedWebhook(capturedWebhook())),
  ]);

  assert.equal(verifyResponse.status, 200);
  assert.equal(webhookResponse.status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.razorpayPaymentId, paymentId);
  assert.equal(harness.order().statusTimeline.length, 1);
  assert.equal(harness.attempt(), undefined);
});

test('invalid verification signature and webhook amount/currency/order mismatches do not newly mark an order paid', async () => {
  const invalidSignatureHarness = createHarness();
  const invalidSignature = await verifyPayment(verificationRequest({
    orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: 'invalid',
  }));
  assert.equal(invalidSignature.status, 400);
  assert.equal(invalidSignatureHarness.order().payment.status, 'pending');

  for (const payment of [
    { amount: 12499 },
    { currency: 'USD' },
    { order_id: 'order_other' },
  ]) {
    const harness = createHarness();
    const response = await paymentWebhook(signedWebhook(capturedWebhook(payment)));
    if (payment.order_id) assert.equal(response.status, 200, 'unmatched provider order events are acknowledged and ignored');
    else assert.notEqual(response.status, 200, `expected mismatch ${JSON.stringify(payment)} to be rejected`);
    assert.equal(harness.order().payment.status, 'pending');
  }
});

test('provider payment ID and order ID mismatches cannot mark the order paid', async () => {
  for (const override of [
    { id: 'pay_different' },
    { order_id: 'order_different' },
  ]) {
    const harness = createHarness();
    gatewayPaymentOverride = override;
    const response = await verifyPayment(verificationRequest({
      orderId,
      razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: paymentSignature(),
    }));
    assert.equal(response.status, 409, `provider mismatch ${JSON.stringify(override)}`);
    assert.equal(harness.order().payment.status, 'pending');
  }
});

test('a late failure webhook records failure metadata without downgrading a capture', async () => {
  setWebhookTestMode();
  const harness = createHarness({ order: initialOrder({ payment: {
    method: 'razorpay', status: 'captured', razorpayOrderId, razorpayPaymentId: paymentId,
  } }) });
  const response = await paymentWebhook(signedWebhook({
    event: 'payment.failed',
    payload: { payment: { entity: {
      id: 'pay_failed_late', order_id: razorpayOrderId, status: 'failed', error_description: 'declined',
    } } },
  }));

  assert.equal(response.status, 200);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.razorpayPaymentId, paymentId);
});
