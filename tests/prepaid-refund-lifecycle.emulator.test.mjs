import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import Module from 'node:module';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';

const PROJECT_ID = 'demo-casaio-rules';
const FIRESTORE_HOST = '127.0.0.1:18080';
const WEBHOOK_SECRET = 'synthetic-emulator-webhook-secret';
const KEY_SECRET = 'synthetic-emulator-razorpay-secret';

function assertSafeInheritedEnvironment() {
  if (process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE === 'live' ||
      process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED === 'true') {
    throw new Error('Refund emulator tests refuse production or live-payment configuration.');
  }

  const projectIds = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
  ].filter(Boolean);
  if (projectIds.some((projectId) => projectId !== PROJECT_ID)) {
    throw new Error('Refund emulator tests require the explicit demo project ID.');
  }

  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (firestoreHost && firestoreHost !== FIRESTORE_HOST) {
    throw new Error('Refund emulator tests require the configured loopback Firestore endpoint.');
  }
}

assertSafeInheritedEnvironment();

Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  RAZORPAY_MODE: 'test',
  RAZORPAY_LIVE_PAYMENTS_ENABLED: 'false',
  RAZORPAY_KEY_ID: 'rzp_test_synthetic_emulator_only',
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_KEY_SECRET_MODE: 'test',
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  RAZORPAY_WEBHOOK_SECRET_MODE: 'test',
});
delete process.env.FIREBASE_CONFIG;
delete process.env.RAZORPAY_LIVE_KEY_ID;
delete process.env.RAZORPAY_LIVE_KEY_SECRET;
delete process.env.RAZORPAY_LIVE_WEBHOOK_SECRET;

const providerByPaymentId = new Map();
const sessionOwners = new Map();
let activeFixture;

class FakeRazorpay {
  constructor() {
    this.payments = {
      fetch: async (paymentId) => {
        const provider = providerByPaymentId.get(paymentId);
        if (!provider) throw new Error('Unconfigured synthetic payment');
        provider.paymentFetches++;
        if (provider.failPaymentFetch) throw new Error('Synthetic provider failure containing secret-like data');
        return structuredClone(provider.payment);
      },
      fetchMultipleRefund: async (paymentId) => {
        const provider = providerByPaymentId.get(paymentId);
        if (!provider) throw new Error('Unconfigured synthetic payment');
        return { items: structuredClone(provider.refunds) };
      },
    };
    this.api = { rq: {
      defaults: {},
      post: async (_url, body, options) => {
        const provider = providerByPaymentId.get(activeFixture.paymentId);
        if (!provider) throw new Error('Unconfigured synthetic payment');
        const idempotencyKey = options.headers['X-Refund-Idempotency'];
        provider.requests.push({ body, idempotencyKey });

        if (provider.postHook) {
          const hook = provider.postHook;
          provider.postHook = undefined;
          await hook();
        }
        if (provider.failBeforeAcceptance > 0) {
          provider.failBeforeAcceptance--;
          throw new Error('Synthetic ambiguous network response');
        }

        const requestBody = typeof body === 'string' ? JSON.parse(body) : body;
        const prior = provider.refundsByIdempotencyKey.get(idempotencyKey);
        if (prior) {
          assert.equal(body, prior.body, 'same idempotency key must use the exact frozen request body');
          return { data: structuredClone(prior.refund) };
        }

        const refund = {
          id: `rfnd_${activeFixture.suffix}`,
          payment_id: activeFixture.paymentId,
          amount: requestBody.amount,
          currency: 'INR',
          status: provider.nextRefundStatus,
          receipt: requestBody.receipt,
          notes: requestBody.notes,
        };
        provider.refunds.push(refund);
        provider.refundsByIdempotencyKey.set(idempotencyKey, { body, refund });
        if (refund.status === 'processed') provider.payment.amount_refunded += refund.amount;
        return { data: structuredClone(refund) };
      },
    } };
  }
}

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') {
    return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  }
  return originalResolveFilename.call(this, request, ...args);
};
Module._load = function (request, ...args) {
  if (request === 'razorpay') return FakeRazorpay;
  return originalLoad.call(this, request, ...args);
};

const { adminApp, adminAuth, adminDb } = await import('@/lib/firebase/admin');
const { POST: cancelOrder } = await import('@/app/api/orders/[orderId]/cancel/route');
const { POST: paymentWebhook } = await import('@/app/api/payment/webhook/route');
const { GET: paymentReconciliationGet, POST: paymentReconciliationPost } = await import('@/app/api/admin/payment-reconciliation/route');
Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

const fixtures = new Set();

function checkLoopbackPort(host, port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(2000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Firestore Emulator endpoint did not respond before timeout.'));
    });
    socket.once('error', () => reject(new Error('Firestore Emulator is unavailable at the required loopback endpoint.')));
  });
}

async function cleanupFixture(fixture) {
  const failures = [];
  try {
    const attemptSnapshot = await fixture.orderRef.collection('refundAttempts').get();
    for (const attempt of attemptSnapshot.docs) {
      try {
        await attempt.ref.delete();
      } catch (error) {
        failures.push(`orders/${fixture.orderId}/refundAttempts/${attempt.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    failures.push(`orders/${fixture.orderId}/refundAttempts query: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const [path, ref] of fixture.ownedDocuments) {
    try {
      await ref.delete();
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  fixtures.delete(fixture);
  providerByPaymentId.delete(fixture.paymentId);
  sessionOwners.delete(fixture.session);
  sessionOwners.delete(fixture.adminSession);
  if (failures.length) throw new AggregateError(failures.map((message) => new Error(message)), 'Refund emulator fixture cleanup failed.');
}

async function createFixture(t, { paymentStatus = 'captured', method = 'razorpay' } = {}) {
  const suffix = randomUUID().replaceAll('-', '');
  const orderId = `refund-emulator-${suffix}`;
  const customerId = `customer-refund-emulator-${suffix}`;
  const adminId = `admin-refund-emulator-${suffix}`;
  const productId = `product-refund-emulator-${suffix}`;
  const paymentId = `pay_refund_emulator_${suffix}`;
  const session = `synthetic-session-${suffix}`;
  const adminSession = `synthetic-admin-session-${suffix}`;
  const orderRef = adminDb.collection('orders').doc(orderId);
  const productRef = adminDb.collection('products').doc(productId);
  const userRef = adminDb.collection('users').doc(customerId);
  const adminRef = adminDb.collection('users').doc(adminId);
  const activeAttemptRef = adminDb.collection('checkoutRequests').doc(`_active_razorpay_${customerId}`);
  const coordinationRef = adminDb.collection('checkoutRequests').doc(`_checkout_coord_${customerId}`);
  const fixture = {
    suffix, orderId, customerId, adminId, productId, paymentId, session, adminSession, orderRef,
    ownedDocuments: [
      [`orders/${orderId}`, orderRef],
      [`products/${productId}`, productRef],
      [`users/${customerId}`, userRef],
      [`users/${adminId}`, adminRef],
      [`checkoutRequests/_active_razorpay_${customerId}`, activeAttemptRef],
      [`checkoutRequests/_checkout_coord_${customerId}`, coordinationRef],
    ],
  };
  fixtures.add(fixture);
  t.after(() => cleanupFixture(fixture));

  sessionOwners.set(session, customerId);
  sessionOwners.set(adminSession, adminId);
  activeFixture = fixture;
  const item = { productId, quantity: 1, fulfillmentStatus: 'pending', unitPrice: 125 };
  const order = {
    orderNumber: orderId,
    customerId,
    orderStatus: method === 'cod' ? 'pending' : 'confirmed',
    cancellationStatus: 'none',
    statusTimeline: [],
    items: [item],
    pricing: { totalAmount: 125 },
    payment: method === 'cod'
      ? { method: 'cod', status: 'pending' }
      : { method: 'razorpay', status: paymentStatus, razorpayOrderId: `order_${suffix}`, razorpayPaymentId: paymentId },
  };
  const batch = adminDb.batch();
  batch.set(orderRef, order);
  batch.set(productRef, { stock: 4, salesCount: 1, status: 'active' });
  batch.set(userRef, { uid: customerId, role: 'customer', status: 'active' });
  batch.set(adminRef, { uid: adminId, role: 'admin', status: 'active' });
  if (method !== 'cod') {
    batch.set(activeAttemptRef, { userId: customerId, orderId, createdAt: new Date().toISOString() });
    batch.set(coordinationRef, { userId: customerId, orderId, createdAt: new Date().toISOString() });
  }
  await batch.commit();

  providerByPaymentId.set(paymentId, {
    payment: { id: paymentId, status: paymentStatus, amount: 12_500, amount_refunded: 0, currency: 'INR' },
    refunds: [],
    refundsByIdempotencyKey: new Map(),
    requests: [],
    paymentFetches: 0,
    failBeforeAcceptance: 0,
    failPaymentFetch: false,
    nextRefundStatus: 'processed',
    postHook: undefined,
  });
  return fixture;
}

async function readOrder(fixture) {
  return (await fixture.orderRef.get()).data();
}

async function readAttempt(fixture) {
  const snapshot = await fixture.orderRef.collection('refundAttempts').get();
  return snapshot.docs[0]?.data();
}

async function readProduct(fixture) {
  return (await adminDb.collection('products').doc(fixture.productId).get()).data();
}

function cancellationRequest(fixture) {
  return new NextRequest(`http://localhost/api/orders/${fixture.orderId}/cancel`, {
    method: 'POST',
    headers: { cookie: `casaio_session=${fixture.session}` },
  });
}

function adminRequest(fixture, { method = 'GET', body, actionId } = {}) {
  return new NextRequest('http://localhost/api/admin/payment-reconciliation', {
    method,
    headers: {
      cookie: `casaio_session=${fixture.adminSession}`,
      ...(actionId ? { 'idempotency-key': actionId } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function cancel(fixture) {
  activeFixture = fixture;
  return cancelOrder(cancellationRequest(fixture), { params: Promise.resolve({ orderId: fixture.orderId }) });
}

async function reconcile(fixture, attemptId, actionId = `reconcile_${randomUUID()}`) {
  return paymentReconciliationPost(adminRequest(fixture, {
    method: 'POST', body: { orderId: fixture.orderId, attemptId }, actionId,
  }));
}

async function refundEvent(fixture, event, overrides = {}) {
  const provider = providerByPaymentId.get(fixture.paymentId);
  const persistedAttempt = await readAttempt(fixture);
  const entity = {
    id: persistedAttempt?.providerRefundId || `rfnd_${fixture.suffix}`,
    payment_id: fixture.paymentId,
    amount: 12_500,
    currency: 'INR',
    status: event === 'refund.processed' ? 'processed' : 'failed',
    receipt: `cancel_${fixture.orderId}`,
    notes: { orderId: fixture.orderId },
    ...overrides,
  };
  const body = JSON.stringify({ event, payload: { refund: { entity } } });
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  const request = new Request('http://localhost/api/payment/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
    body,
  });
  activeFixture = fixture;
  assert.ok(provider);
  return paymentWebhook(request);
}

before(async () => {
  if (process.env.FIREBASE_PROJECT_ID !== PROJECT_ID ||
      process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_HOST ||
      adminApp.options.projectId !== PROJECT_ID) {
    throw new Error('Refund integration tests are pinned to demo-casaio-rules at 127.0.0.1:18080 only.');
  }
  await checkLoopbackPort('127.0.0.1', 18080);
  // A read through the Admin SDK proves the configured endpoint speaks Firestore
  // before any synthetic fixture is written.
  await adminDb.collection('casaioRefundEmulatorPreflight').limit(1).get();
});

beforeEach(() => {
  mock.restoreAll();
  mock.method(adminAuth, 'verifySessionCookie', async (cookie, checkRevoked) => {
    assert.equal(checkRevoked, true, 'admin routes must retain revocation-aware session checks');
    const uid = sessionOwners.get(cookie);
    if (!uid) throw new Error('Unknown synthetic session');
    return { uid, email: 'refund-emulator@example.invalid' };
  });
});

after(async () => {
  const failures = [];
  for (const fixture of [...fixtures]) {
    try {
      await cleanupFixture(fixture);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'One or more emulator fixtures could not be cleaned up.');
});

test('captured prepaid cancellation persists the frozen refund request and applies processed state once', async (t) => {
  const fixture = await createFixture(t);
  const response = await cancel(fixture);
  assert.equal(response.status, 200);

  const [order, attempt, product] = await Promise.all([
    readOrder(fixture), readAttempt(fixture), readProduct(fixture),
  ]);
  assert.equal(order.orderStatus, 'cancelled');
  assert.equal(order.cancellationStatus, 'completed');
  assert.equal(order.payment.status, 'refunded');
  assert.equal(attempt.state, 'succeeded');
  assert.equal(attempt.amount, 12_500);
  assert.equal(attempt.currency, 'INR');
  assert.equal(attempt.paymentId, fixture.paymentId);
  assert.equal(attempt.requestBodyJson, JSON.stringify(attempt.requestBody));
  assert.equal(attempt.requestBody.amount, 12_500);
  assert.equal(attempt.idempotencyKey, `casaio-cancel-${attempt.id}`);
  assert.equal(product.stock, 5);

  const provider = providerByPaymentId.get(fixture.paymentId);
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0].body, attempt.requestBodyJson);
  assert.equal(provider.requests[0].idempotencyKey, attempt.idempotencyKey);

  assert.equal((await cancel(fixture)).status, 200);
  assert.equal((await readProduct(fixture)).stock, 5);
  assert.equal((await fixture.orderRef.collection('refundAttempts').get()).size, 1);
  assert.equal(provider.requests.length, 1);
});

test('concurrent cancellation requests persist one attempt and share the frozen idempotent request', async (t) => {
  const fixture = await createFixture(t);
  const responses = await Promise.all([cancel(fixture), cancel(fixture)]);
  assert.ok(responses.every((response) => response.status === 200 || response.status === 202));

  const attempts = await fixture.orderRef.collection('refundAttempts').get();
  assert.equal(attempts.size, 1);
  const attempt = attempts.docs[0].data();
  const provider = providerByPaymentId.get(fixture.paymentId);
  assert.ok(provider.requests.length >= 1 && provider.requests.length <= 2);
  assert.ok(provider.requests.every((request) => request.idempotencyKey === attempt.idempotencyKey));
  assert.ok(provider.requests.every((request) => request.body === attempt.requestBodyJson));
  // The fake provider may confirm the refund in either racing request before
  // this read. In that case cancellation has already restored inventory once.
  assert.ok([4, 5].includes((await readProduct(fixture)).stock));

  assert.equal((await refundEvent(fixture, 'refund.processed')).status, 200);
  assert.equal((await refundEvent(fixture, 'refund.processed')).status, 200);
  assert.equal((await readOrder(fixture)).payment.status, 'refunded');
  assert.equal((await readAttempt(fixture)).state, 'succeeded');
  assert.equal((await readProduct(fixture)).stock, 5);
});

test('ambiguous submission remains recoverable and retry reuses the exact key and body', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.failBeforeAcceptance = 1;

  const firstResponse = await cancel(fixture);
  assert.equal(firstResponse.status, 202);
  const firstOrder = await readOrder(fixture);
  const firstAttempt = await readAttempt(fixture);
  assert.equal(firstOrder.orderStatus, 'confirmed');
  assert.equal(firstOrder.cancellationStatus, 'processing');
  assert.equal(firstOrder.payment.status, 'captured');
  assert.equal(firstAttempt.state, 'submission_unknown');
  assert.equal(firstOrder.payment.reconciliationRequired, true);
  assert.equal((await readProduct(fixture)).stock, 4);
  const frozenKey = firstAttempt.idempotencyKey;
  const frozenBody = firstAttempt.requestBodyJson;

  provider.nextRefundStatus = 'pending';
  const retryResponse = await cancel(fixture);
  assert.equal(retryResponse.status, 202);
  const retryOrder = await readOrder(fixture);
  const retryAttempt = await readAttempt(fixture);
  assert.equal(retryAttempt.state, 'provider_identified');
  assert.equal(retryOrder.payment.status, 'refund_pending');
  assert.equal(retryAttempt.idempotencyKey, frozenKey);
  assert.equal(retryAttempt.requestBodyJson, frozenBody);
  assert.equal(provider.requests.length, 2);
  assert.ok(provider.requests.every((request) => request.idempotencyKey === frozenKey && request.body === frozenBody));
  assert.equal((await readProduct(fixture)).stock, 4);

  assert.equal((await refundEvent(fixture, 'refund.processed')).status, 200);
  assert.equal((await readOrder(fixture)).cancellationStatus, 'completed');
  assert.equal((await readOrder(fixture)).payment.status, 'refunded');
  assert.equal((await readProduct(fixture)).stock, 5);
});

test('early, duplicate, contradictory, and mismatched webhook events preserve persisted invariants', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.nextRefundStatus = 'pending';
  let earlyWebhookStatus;
  provider.postHook = async () => {
    earlyWebhookStatus = (await refundEvent(fixture, 'refund.processed')).status;
  };

  assert.equal((await cancel(fixture)).status, 202);
  assert.equal(earlyWebhookStatus, 503);
  assert.equal((await readAttempt(fixture)).state, 'provider_identified');
  assert.equal((await refundEvent(fixture, 'refund.processed', { amount: 12_499 })).status, 409);
  assert.equal((await refundEvent(fixture, 'refund.processed', { payment_id: 'pay_unrelated' })).status, 200);
  assert.equal((await readProduct(fixture)).stock, 4);

  assert.equal((await refundEvent(fixture, 'refund.processed')).status, 200);
  assert.equal((await refundEvent(fixture, 'refund.failed')).status, 200);
  const [order, attempt, product] = await Promise.all([
    readOrder(fixture), readAttempt(fixture), readProduct(fixture),
  ]);
  assert.equal(order.payment.status, 'refunded');
  assert.equal(order.orderStatus, 'cancelled');
  assert.equal(order.cancellationStatus, 'completed');
  assert.equal(attempt.state, 'succeeded');
  assert.equal(attempt.providerStatus, 'processed');
  assert.equal(product.stock, 5);
});

test('uncaptured or unresolved prepaid payments are rejected without refund submission', async (t) => {
  for (const paymentStatus of ['pending', 'authorized']) {
    await t.test(paymentStatus, async (subtest) => {
      const fixture = await createFixture(subtest, { paymentStatus });
      const response = await cancel(fixture);
      assert.equal(response.status, 409);
      assert.equal((await readOrder(fixture)).cancellationStatus, 'none');
      assert.equal((await fixture.orderRef.collection('refundAttempts').get()).size, 0);
      const provider = providerByPaymentId.get(fixture.paymentId);
      assert.equal(provider.paymentFetches, 0);
      assert.equal(provider.requests.length, 0);
      assert.equal((await readProduct(fixture)).stock, 4);
    });
  }
});

test('COD cancellation restores inventory without creating a refund attempt or calling the fake provider', async (t) => {
  const fixture = await createFixture(t, { method: 'cod' });
  const response = await cancel(fixture);
  assert.equal(response.status, 200);
  const [order, product] = await Promise.all([readOrder(fixture), readProduct(fixture)]);
  assert.equal(order.orderStatus, 'cancelled');
  assert.equal(order.cancellationStatus, 'completed');
  assert.equal(order.payment.status, 'pending');
  assert.equal(product.stock, 5);
  assert.equal((await fixture.orderRef.collection('refundAttempts').get()).size, 0);
  assert.equal(providerByPaymentId.get(fixture.paymentId).requests.length, 0);
});

test('admin inspection is read-only, owner role is required, and unknown provider state stays unresolved', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.failBeforeAcceptance = 1;
  assert.equal((await cancel(fixture)).status, 202);
  const attempt = await readAttempt(fixture);
  const before = await readOrder(fixture);

  const inspected = await paymentReconciliationGet(adminRequest(fixture, {
    method: 'GET',
  }));
  assert.equal(inspected.status, 200);
  const refreshed = await paymentReconciliationGet(new NextRequest(
    `http://localhost/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`,
    { headers: { cookie: `casaio_session=${fixture.adminSession}` } },
  ));
  const detail = await refreshed.json();
  assert.equal(refreshed.status, 200);
  assert.equal(detail.case.attempts[0].id, attempt.id);
  assert.equal(detail.case.attempts[0].amount, attempt.amount);
  assert.equal(detail.case.attempts[0].state, attempt.state);
  assert.equal(detail.case.attempts[0].paymentId, undefined);
  assert.equal(detail.case.attempts[0].idempotencyKey, undefined);
  assert.equal(detail.case.attempts[0].requestBody, undefined);
  assert.equal(detail.case.payment.razorpayPaymentId, undefined);
  const detailText = JSON.stringify(detail);
  assert.equal(detailText.includes(fixture.paymentId), false);
  assert.equal(detailText.includes(attempt.idempotencyKey), false);
  assert.equal(detailText.includes(attempt.requestBodyJson), false);
  assert.equal(detailText.includes(fixture.customerId), false);
  const refundQueue = await paymentReconciliationGet(new NextRequest(
    'http://localhost/api/admin/payment-reconciliation?refunds=true',
    { headers: { cookie: `casaio_session=${fixture.adminSession}` } },
  ));
  assert.equal(refundQueue.status, 200);
  const queuePayload = await refundQueue.json();
  const queueEntry = queuePayload.refunds.find((entry) => entry.orderId === fixture.orderId && entry.id === attempt.id);
  assert.ok(queueEntry);
  assert.equal(queueEntry.orderNumber, fixture.orderId);
  assert.equal(queueEntry.diagnosticCategory, 'refund_submission_unknown');
  assert.equal(queueEntry.paymentId, undefined);
  assert.equal(queueEntry.idempotencyKey, undefined);
  assert.equal(queueEntry.requestBodyJson, undefined);
  assert.equal(JSON.stringify(queueEntry).includes(fixture.paymentId), false);
  assert.equal((await readOrder(fixture)).payment.status, before.payment.status);
  assert.equal((await fixture.orderRef.collection('refundReconciliationAudit').get()).size, 0);

  const customerRequest = new NextRequest('http://localhost/api/admin/payment-reconciliation', {
    method: 'POST',
    headers: { cookie: `casaio_session=${fixture.session}`, 'idempotency-key': `unauth_${randomUUID()}` },
    body: JSON.stringify({ orderId: fixture.orderId, attemptId: attempt.id }),
  });
  assert.equal((await paymentReconciliationPost(customerRequest)).status, 403);
  const customerInspection = await paymentReconciliationGet(new NextRequest(
    `http://localhost/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`,
    { headers: { cookie: `casaio_session=${fixture.session}` } },
  ));
  assert.equal(customerInspection.status, 403);
  const customerQueueInspection = await paymentReconciliationGet(new NextRequest(
    'http://localhost/api/admin/payment-reconciliation?refunds=true',
    { headers: { cookie: `casaio_session=${fixture.session}` } },
  ));
  assert.equal(customerQueueInspection.status, 403);

  const unknown = await reconcile(fixture, attempt.id);
  assert.equal(unknown.status, 202);
  assert.equal((await readAttempt(fixture)).state, 'submission_unknown');
  assert.equal((await readOrder(fixture)).payment.reconciliationRequired, true);
  const audit = await fixture.orderRef.collection('refundReconciliationAudit').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().actorUid, fixture.adminId);
  assert.equal(audit.docs[0].data().outcome, 'provider_status_unknown');
  assert.equal(provider.requests.length, 1, 'reconciliation must never submit another refund');
  const auditedDetailResponse = await paymentReconciliationGet(new NextRequest(
    `http://localhost/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`,
    { headers: { cookie: `casaio_session=${fixture.adminSession}` } },
  ));
  const auditedDetail = await auditedDetailResponse.json();
  assert.equal(auditedDetail.case.history[0].outcome, 'provider_status_unknown');
  assert.equal(auditedDetail.case.history[0].actorUid, undefined);
  assert.ok(auditedDetail.case.history[0].actorReference);
});

test('admin reconciliation applies verified pending and processed states once with atomic audit', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.nextRefundStatus = 'pending';
  assert.equal((await cancel(fixture)).status, 202);
  const attempt = await readAttempt(fixture);
  const actionId = `admin_reconcile_${randomUUID()}`;

  const pending = await reconcile(fixture, attempt.id, actionId);
  assert.equal(pending.status, 200);
  assert.equal((await readAttempt(fixture)).state, 'provider_identified');
  assert.equal((await readOrder(fixture)).payment.status, 'refund_pending');
  assert.equal((await readOrder(fixture)).payment.reconciliationRequired, false);
  assert.equal((await readOrder(fixture)).payment.reconciliationStatus, 'resolved');
  assert.equal((await readProduct(fixture)).stock, 4);
  const duplicateAction = await reconcile(fixture, attempt.id, actionId);
  assert.equal(duplicateAction.status, 200);
  assert.equal((await fixture.orderRef.collection('refundReconciliationAudit').get()).size, 1);
  assert.equal(provider.requests.length, 1);

  provider.refunds[0].status = 'processed';
  provider.payment.amount_refunded = 12_500;
  const processed = await reconcile(fixture, attempt.id);
  assert.equal(processed.status, 200);
  assert.equal((await readAttempt(fixture)).state, 'succeeded');
  assert.equal((await readOrder(fixture)).orderStatus, 'cancelled');
  assert.equal((await readOrder(fixture)).cancellationStatus, 'completed');
  assert.equal((await readOrder(fixture)).payment.status, 'refunded');
  assert.equal((await readOrder(fixture)).payment.reconciliationRequired, false);
  assert.equal((await readProduct(fixture)).stock, 5);
  assert.equal(provider.requests.length, 1);
  assert.equal((await fixture.orderRef.collection('refundReconciliationAudit').get()).size, 2);

  provider.refunds[0].status = 'failed';
  provider.payment.amount_refunded = 0;
  const contradictory = await reconcile(fixture, attempt.id);
  assert.equal(contradictory.status, 409);
  assert.equal((await readAttempt(fixture)).state, 'succeeded');
  assert.equal((await readProduct(fixture)).stock, 5);
});

test('admin reconciliation rejects mismatched provider evidence and does not change inventory', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.nextRefundStatus = 'pending';
  assert.equal((await cancel(fixture)).status, 202);
  const attempt = await readAttempt(fixture);
  provider.refunds[0].payment_id = 'pay_unrelated_synthetic';

  const response = await reconcile(fixture, attempt.id);
  assert.equal(response.status, 409);
  assert.equal((await readAttempt(fixture)).state, 'provider_identified');
  assert.equal((await readOrder(fixture)).payment.status, 'refund_pending');
  assert.equal((await readOrder(fixture)).payment.reconciliationRequired, true);
  assert.equal((await readProduct(fixture)).stock, 4);
  assert.equal(provider.requests.length, 1);
  const audit = await fixture.orderRef.collection('refundReconciliationAudit').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().diagnosticCategory, 'provider_evidence_mismatch');
  assert.equal(JSON.stringify(audit.docs[0].data()).includes(KEY_SECRET), false);
});

test('admin reconciliation leaves amount, currency, refund ID, and order-note mismatches unresolved', async (t) => {
  const mutations = [
    ['amount', (refund) => { refund.amount = 12_499; }],
    ['currency', (refund) => { refund.currency = 'USD'; }],
    ['refund identity', (refund) => { refund.id = 'rfnd_other_synthetic'; }],
    ['order note', (refund) => { refund.notes.orderId = 'order_other_synthetic'; }],
  ];
  for (const [label, mutate] of mutations) {
    await t.test(label, async (subtest) => {
      const fixture = await createFixture(subtest);
      const provider = providerByPaymentId.get(fixture.paymentId);
      provider.nextRefundStatus = 'pending';
      assert.equal((await cancel(fixture)).status, 202);
      const attempt = await readAttempt(fixture);
      mutate(provider.refunds[0]);
      const response = await reconcile(fixture, attempt.id);
      assert.ok(response.status === 409 || response.status === 202);
      assert.equal((await readProduct(fixture)).stock, 4);
      assert.notEqual((await readAttempt(fixture)).state, 'succeeded');
      assert.equal((await readOrder(fixture)).payment.reconciliationRequired, true);
      const audit = await fixture.orderRef.collection('refundReconciliationAudit').get();
      assert.equal(audit.size, 1);
      assert.ok(['provider_status_unknown', 'provider_evidence_unresolved'].includes(audit.docs[0].data().outcome));
    });
  }
});

test('concurrent admin reconciliation actions finalize and restore inventory exactly once', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.nextRefundStatus = 'pending';
  assert.equal((await cancel(fixture)).status, 202);
  const attempt = await readAttempt(fixture);
  provider.refunds[0].status = 'processed';
  provider.payment.amount_refunded = 12_500;

  const [first, second] = await Promise.all([
    reconcile(fixture, attempt.id),
    reconcile(fixture, attempt.id),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await readAttempt(fixture)).state, 'succeeded');
  assert.equal((await readOrder(fixture)).payment.status, 'refunded');
  assert.equal((await readProduct(fixture)).stock, 5);
  assert.equal(provider.requests.length, 1, 'admin reconciliation must not submit refunds');
  assert.equal((await fixture.orderRef.collection('refundReconciliationAudit').get()).size, 2);
});

test('provider-confirmed failure is audited and does not restore inventory', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.nextRefundStatus = 'failed';
  const cancellation = await cancel(fixture);
  assert.equal(cancellation.status, 409);
  const attempt = await readAttempt(fixture);
  assert.equal(attempt.state, 'failed');
  assert.equal((await readOrder(fixture)).payment.status, 'refund_failed');

  const response = await reconcile(fixture, attempt.id);
  assert.equal(response.status, 200);
  assert.equal((await readAttempt(fixture)).state, 'failed');
  assert.equal((await readOrder(fixture)).orderStatus, 'confirmed');
  assert.equal((await readProduct(fixture)).stock, 4);
  assert.equal(provider.requests.length, 1);
  const audit = await fixture.orderRef.collection('refundReconciliationAudit').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().outcome, 'provider_failed');
  assert.equal(audit.docs[0].data().actorUid, fixture.adminId);
});

test('provider failures produce categorized redacted diagnostics and keep the case open', async (t) => {
  const fixture = await createFixture(t);
  const provider = providerByPaymentId.get(fixture.paymentId);
  provider.failBeforeAcceptance = 1;
  assert.equal((await cancel(fixture)).status, 202);
  const attempt = await readAttempt(fixture);
  provider.failPaymentFetch = true;
  const diagnosticCalls = [];
  mock.method(console, 'error', (...args) => diagnosticCalls.push(args));

  const response = await reconcile(fixture, attempt.id);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.status, 'unknown');
  assert.ok(payload.correlationId);
  assert.equal((await readAttempt(fixture)).state, 'submission_unknown');
  assert.equal((await readOrder(fixture)).payment.reconciliationRequired, true);
  assert.equal(diagnosticCalls.length, 1);
  assert.equal(diagnosticCalls[0][1].category, 'razorpay_provider_failure');
  const diagnosticText = JSON.stringify({ payload, diagnosticCalls, audit: (await fixture.orderRef.collection('refundReconciliationAudit').get()).docs.map((doc) => doc.data()) });
  assert.equal(diagnosticText.includes('secret-like'), false);
  assert.equal(diagnosticText.includes(fixture.customerId), false);
  assert.equal(diagnosticText.includes(fixture.paymentId), false);
});
