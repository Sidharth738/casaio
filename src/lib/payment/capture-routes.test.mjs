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
      fetch: async (id) => {
        if (razorpayStatusError) throw razorpayStatusError;
        return { id, amount: 12500, currency: 'INR', ...razorpayOrderOverride };
      },
      fetchPayments: async () => {
        if (razorpayStatusError) throw razorpayStatusError;
        return { items: razorpayPaymentListOverride || [{
          id: paymentId,
          order_id: razorpayOrderId,
          amount: 12500,
          currency: 'INR',
          status: 'captured',
        }] };
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
const { POST: verifyPayment } = await import('@/app/api/payment/verify/route');
const { POST: paymentWebhook } = await import('@/app/api/payment/webhook/route');
const { GET: checkPaymentAttempt } = await import('@/app/api/payment/attempt/route');
const { GET: getOrderPaymentStatus } = await import('@/app/api/orders/[orderId]/payment-status/route');
Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

const orderId = 'order-local-1';
const userId = 'customer-local-1';
const razorpayOrderId = 'order_test_local-1';
const paymentId = 'pay_local-1';
const webhookSecret = 'fake-local-webhook-secret';
const keySecret = 'fake-local-key-secret';
let gatewayPaymentOverride;
let authenticatedUserId = userId;
let paymentAttemptLockReadError;
let razorpayStatusError;
let razorpayOrderOverride;
let razorpayPaymentListOverride;

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

function createHarness({ order = initialOrder(), activeAttempt = { orderId, userId }, missingActiveAttempt = false, capturePaymentId = paymentId, orders = [] } = {}) {
  const couponId = order.couponApplied?.couponId;
  const usagePath = couponId ? `couponUserUsage/${getCouponUserUsageKey(couponId, userId)}` : null;
  const records = new Map([
    [`orders/${orderId}`, structuredClone(order)],
    [`checkoutRequests/_active_razorpay_${userId}`, structuredClone(activeAttempt)],
    [`users/${userId}`, { role: 'customer', status: 'active' }],
    ['users/customer-other', { role: 'customer', status: 'active' }],
    ...(usagePath ? [
      [usagePath, { state: 'ready', couponId, customerId: userId, occupiedCount: 1 }],
      [`${usagePath}/reservations/${orderId}`, {
        orderId, couponId, customerId: userId, paymentMethod: 'razorpay', state: 'reserved',
      }],
    ] : []),
  ]);
  for (const entry of orders) records.set(`orders/${entry.id}`, structuredClone(entry.order));
  if (missingActiveAttempt) records.delete(`checkoutRequests/_active_razorpay_${userId}`);
  const operations = [];
  let queue = Promise.resolve();

  const ref = (path) => ({
    id: path.split('/').at(-1),
    path,
    get: async () => {
      if (path === `checkoutRequests/_active_razorpay_${userId}` && paymentAttemptLockReadError) {
        throw paymentAttemptLockReadError;
      }
      return snapshot(records.get(path));
    },
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
      const fieldName = parts.at(-1);
      if (value?.constructor?.name === 'ArrayUnionTransform') {
        const existing = Array.isArray(target[fieldName]) ? target[fieldName] : [];
        target[fieldName] = [...new Set([...existing, ...value.elements])];
      } else {
        target[fieldName] = value;
      }
    }
    records.set(path, current);
  };

  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: authenticatedUserId, email: 'customer@example.invalid' }));
  mock.method(adminDb, 'collection', (collectionName) => ({
    doc: (id) => ref(`${collectionName}/${id}`),
    where: (field, _operator, value) => {
      const query = {
        limit: () => query,
        get: async () => {
          if (collectionName !== 'orders') return { empty: true, docs: [] };
          const docs = [...records.entries()]
            .filter(([path, data]) => path.startsWith('orders/') && path.split('/').length === 2 &&
              field.split('.').reduce((current, key) => current?.[key], data) === value)
            .map(([path, data]) => ({
              ref: ref(path),
              id: path.split('/').at(-1),
              data: () => structuredClone(data),
            }));
          return { empty: docs.length === 0, docs };
        },
      };
      return query;
    },
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
        set: (documentRef, data, options = {}) => {
          writeStarted = true;
          operations.push({ type: 'set', path: documentRef.path });
          writes.push(() => records.set(documentRef.path, options.merge
            ? { ...(records.get(documentRef.path) || {}), ...structuredClone(data) }
            : structuredClone(data)));
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

function orderPaymentStatusRequest() {
  return {
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'fake-session' } : undefined },
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
  authenticatedUserId = userId;
  paymentAttemptLockReadError = undefined;
  razorpayStatusError = undefined;
  razorpayOrderOverride = undefined;
  razorpayPaymentListOverride = undefined;
});

test('browser recovery reads persisted capture after webhook removed the active lock', async () => {
  const harness = createHarness();
  const webhookResponse = await paymentWebhook(signedWebhook(capturedWebhook()));
  assert.equal(webhookResponse.status, 200);
  assert.equal(harness.attempt(), undefined);

  const statusResponse = await getOrderPaymentStatus(orderPaymentStatusRequest(), { params: Promise.resolve({ orderId }) });
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(status.confirmationState, 'confirmed');
  assert.equal(status.paymentStatus, 'captured');
  assert.equal(status.orderStatus, 'confirmed');
  assert.equal('razorpayPaymentId' in status, false);
});

test('captured payment requiring reconciliation returns explicit non-confirmation result', async () => {
  const harness = createHarness({ order: initialOrder({
    payment: { method: 'razorpay', status: 'failed', razorpayOrderId },
    orderStatus: 'cancelled',
  }) });
  const response = await verifyPayment(verificationRequest({
    orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: paymentSignature(),
  }));
  const result = await response.json();

  assert.equal(response.status, 202);
  assert.equal(result.confirmationState, 'reconciliation_required');
  assert.equal(result.paymentStatus, 'captured');
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().payment.reconciliationRequired, true);
  assert.equal(harness.order().orderStatus, 'cancelled');

  const statusResponse = await getOrderPaymentStatus(orderPaymentStatusRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal((await statusResponse.json()).confirmationState, 'reconciliation_required');
});

test('additional captured payment is reported as reconciliation-required without replacing the recorded capture', async () => {
  const harness = createHarness({ order: initialOrder({
    orderStatus: 'confirmed',
    payment: { method: 'razorpay', status: 'captured', razorpayOrderId, razorpayPaymentId: 'pay_primary' },
  }) });
  const response = await verifyPayment(verificationRequest({
    orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: paymentSignature(),
  }));
  const result = await response.json();

  assert.equal(response.status, 202);
  assert.equal(result.confirmationState, 'reconciliation_required');
  assert.equal(harness.order().payment.razorpayPaymentId, 'pay_primary');
  assert.equal(harness.order().payment.reconciliationRequired, true);
  assert.deepEqual(harness.order().payment.reconciliationPaymentIds, [paymentId]);
});

test('pending, failed, and reconciliation states never appear as a successful confirmation', async () => {
  for (const [payment, orderStatus, expected] of [
    [{ method: 'razorpay', status: 'pending', razorpayOrderId }, 'pending', 'pending'],
    [{ method: 'razorpay', status: 'failed', razorpayOrderId }, 'pending', 'failed'],
    [{ method: 'razorpay', status: 'captured', razorpayOrderId, reconciliationRequired: true }, 'pending', 'reconciliation_required'],
  ]) {
    createHarness({ order: initialOrder({ payment, orderStatus }) });
    const response = await getOrderPaymentStatus(orderPaymentStatusRequest(), { params: Promise.resolve({ orderId }) });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.confirmationState, expected);
    assert.notEqual(result.confirmationState, 'confirmed');
  }
});

test('customer cannot read payment status for another customer order', async () => {
  createHarness();
  authenticatedUserId = 'customer-other';
  const response = await getOrderPaymentStatus(orderPaymentStatusRequest(), { params: Promise.resolve({ orderId }) });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Order not found' });
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

test('payment attempt recovers an unresolved customer order when the active lock is missing', async () => {
  const harness = createHarness({ missingActiveAttempt: true });
  razorpayOrderOverride = { status: 'attempted', attempts: 1 };
  razorpayPaymentListOverride = [];
  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.active, true);
  assert.equal(result.status, 'unknown');
  assert.equal(result.retryAvailable, false);
  assert.equal(result.orderId, orderId);
  assert.equal(harness.attempt().orderId, orderId);
  assert.equal(harness.order().payment.status, 'pending');
});

test('payment attempt returns inactive only when no owner-scoped unresolved order exists', async () => {
  const harness = createHarness({
    order: initialOrder({
      orderStatus: 'confirmed',
      payment: { method: 'razorpay', status: 'captured', razorpayOrderId, razorpayPaymentId: paymentId },
    }),
    missingActiveAttempt: true,
    orders: [{
      id: 'other-customer-order',
      order: initialOrder({ customerId: 'customer-other' }),
    }],
  });
  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { active: false });
  assert.equal(harness.attempt(), undefined);
});

test('payment attempt recovers a captured order without its lock and preserves reconciliation state', async () => {
  const harness = createHarness({ missingActiveAttempt: true });
  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.active, true);
  assert.equal(result.status, 'captured');
  assert.equal(result.orderId, orderId);
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().orderStatus, 'confirmed');
  assert.equal(harness.attempt(), undefined);
});

test('payment attempt finds a persisted captured reconciliation case after refresh without a lock', async () => {
  const harness = createHarness({
    order: initialOrder({
      orderStatus: 'cancelled',
      payment: {
        method: 'razorpay',
        status: 'captured',
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        reconciliationRequired: true,
        reconciliationStatus: 'open',
      },
    }),
    missingActiveAttempt: true,
  });
  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.active, true);
  assert.equal(result.status, 'captured');
  assert.equal(result.orderId, orderId);
  assert.equal(harness.order().payment.reconciliationRequired, true);
  assert.equal(harness.order().orderStatus, 'cancelled');
});

test('payment attempt reports a provider-confirmed failed payment without claiming capture', async () => {
  const harness = createHarness({ missingActiveAttempt: true });
  razorpayOrderOverride = { status: 'attempted', attempts: 1 };
  razorpayPaymentListOverride = [{
    id: 'pay-failed-local',
    order_id: razorpayOrderId,
    amount: 12500,
    currency: 'INR',
    status: 'failed',
  }];
  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.active, true);
  assert.equal(result.status, 'failed');
  assert.equal(harness.order().payment.status, 'pending');
  assert.equal(harness.attempt().orderId, orderId);
});

test('concurrent recovery requests converge on one recovered captured order', async () => {
  const harness = createHarness({ missingActiveAttempt: true });
  const [first, second] = await Promise.all([
    checkPaymentAttempt(orderPaymentStatusRequest()),
    checkPaymentAttempt(orderPaymentStatusRequest()),
  ]);
  const firstResult = await first.json();
  const secondResult = await second.json();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstResult.status, 'captured', JSON.stringify({ firstResult, secondResult }));
  assert.equal(secondResult.status, 'captured', JSON.stringify({ firstResult, secondResult }));
  assert.equal(harness.order().payment.status, 'captured');
  assert.equal(harness.order().statusTimeline.length, 1);
  assert.equal(harness.attempt(), undefined);
});

test('payment attempt returns a safe correlated 503 and redacted Firestore category', async () => {
  createHarness();
  paymentAttemptLockReadError = new Error('private customer-local-1 pay_local-1 credential-value');
  const logs = [];
  mock.method(console, 'error', (...args) => logs.push(args));

  const response = await checkPaymentAttempt(orderPaymentStatusRequest());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.active, true);
  assert.equal(body.status, 'unknown');
  assert.equal(body.retryAvailable, false);
  assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
  assert.match(body.error, /Do not pay again/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'payment_attempt_lookup_failed');
  assert.deepEqual(logs[0][1], {
    correlationId: body.correlationId,
    category: 'firestore_read_failure',
  });
  const diagnostic = JSON.stringify({ logs, body });
  for (const sensitive of ['credential-value', 'customer-local-1', 'pay_local-1', razorpayOrderId]) {
    assert.equal(diagnostic.includes(sensitive), false);
  }
});

test('payment attempt classifies configuration and provider failures distinctly without exposing details', async () => {
  createHarness();
  const logs = [];
  mock.method(console, 'error', (...args) => logs.push(args));

  process.env.RAZORPAY_MODE = 'invalid-private-value';
  const configurationResponse = await checkPaymentAttempt(orderPaymentStatusRequest());
  assert.equal(configurationResponse.status, 503);
  assert.equal(logs.at(-1)[1].category, 'razorpay_configuration_failure');
  assert.equal(JSON.stringify(logs).includes('invalid-private-value'), false);

  setWebhookTestMode();
  razorpayStatusError = new Error('private credential-value pay_local-1');
  const providerResponse = await checkPaymentAttempt(orderPaymentStatusRequest());
  assert.equal(providerResponse.status, 503);
  assert.equal(logs.at(-1)[1].category, 'razorpay_provider_failure');
  const diagnostics = JSON.stringify({ logs, body: await providerResponse.json() });
  for (const sensitive of ['credential-value', 'customer-local-1', 'pay_local-1', razorpayOrderId]) {
    assert.equal(diagnostics.includes(sensitive), false);
  }
});

test('payment attempt still requires an authenticated customer session', async () => {
  createHarness();
  const response = await checkPaymentAttempt({ cookies: { get: () => undefined } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
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
