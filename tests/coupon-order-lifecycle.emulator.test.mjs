import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';

// These values are scoped to this test process and are set before importing the
// Admin SDK or any application route. The emulator does not need credentials.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080';
process.env.GCLOUD_PROJECT = 'demo-casaio-rules';
process.env.GOOGLE_CLOUD_PROJECT = 'demo-casaio-rules';
process.env.FIREBASE_PROJECT_ID = 'demo-casaio-rules';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.FIREBASE_CONFIG;

process.env.NODE_ENV = 'test';
process.env.RAZORPAY_MODE = 'test';
process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED = 'false';
process.env.RAZORPAY_KEY_ID = 'rzp_test_local_emulator_only';
process.env.RAZORPAY_KEY_SECRET = 'synthetic-local-payment-key';
process.env.RAZORPAY_KEY_SECRET_MODE = 'test';
process.env.RAZORPAY_WEBHOOK_SECRET = 'synthetic-local-webhook-secret';
process.env.RAZORPAY_WEBHOOK_SECRET_MODE = 'test';
delete process.env.RAZORPAY_LIVE_KEY_ID;
delete process.env.RAZORPAY_LIVE_KEY_SECRET;
delete process.env.RAZORPAY_LIVE_WEBHOOK_SECRET;

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18080');
assert.equal(process.env.FIREBASE_PROJECT_ID, 'demo-casaio-rules');

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const fakePayments = new Map();

class FakeRazorpay {
  constructor() {
    this.api = { rq: { defaults: {} } };
    this.payments = {
      fetch: async (paymentId) => {
        const payment = fakePayments.get(paymentId);
        if (!payment) throw new Error('Unexpected synthetic payment ID');
        return structuredClone(payment);
      },
    };
  }
}

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
const { getCouponUserUsageKey, getCouponUserUsageRefs } = await import('@/lib/coupons/user-usage');
const { getActivePaymentAttemptRef, getCheckoutCoordinationRef } = await import('@/lib/payment/attempts');
const { POST: createOrder } = await import('@/app/api/orders/create/route');
const { POST: verifyPayment } = await import('@/app/api/payment/verify/route');
const { POST: paymentWebhook } = await import('@/app/api/payment/webhook/route');
const { POST: updateFulfillment } = await import('@/app/api/seller/orders/[orderId]/fulfillment/route');
const { POST: cancelOrder } = await import('@/app/api/orders/[orderId]/cancel/route');

Module._resolveFilename = originalResolveFilename;
Module._load = originalLoad;

assert.equal(adminApp.options.projectId, 'demo-casaio-rules', 'Admin SDK must use the explicit emulator project');

const ownedRefs = new Map();
const ownedUsageRefs = new Map();
const ownedUsers = new Set();
const ownedCustomers = new Set();
const ownedSellers = new Set();
let authMock;

function track(ref) {
  ownedRefs.set(ref.path, ref);
  return ref;
}

function doc(collection, id) {
  const ref = track(adminDb.collection(collection).doc(id));
  if (collection === 'couponUserUsage') ownedUsageRefs.set(ref.path, ref);
  return ref;
}

function newId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function sessionRequest(uid, body = {}) {
  return {
    cookies: { get: (name) => name === 'casaio_session' ? { value: `local-session:${uid}` } : undefined },
    json: async () => body,
  };
}

function responseData(response) {
  return response.json();
}

function registerCustomer(uid) {
  ownedUsers.add(uid);
  ownedCustomers.add(uid);
  return doc('users', uid).set({ role: 'customer', status: 'active' });
}

async function registerSeller(uid) {
  ownedUsers.add(uid);
  ownedSellers.add(uid);
  await Promise.all([
    doc('users', uid).set({ role: 'seller', status: 'active' }),
    doc('sellers', uid).set({ status: 'approved', storeName: `Local ${uid}` }),
  ]);
}

async function seedCoupon({ id = newId('coupon'), code = newId('SAVE').toUpperCase(), usageLimit = 10, perUserLimit = 5, usageCount = 0 } = {}) {
  const normalizedCode = code.toUpperCase();
  const codeId = createHash('sha256').update(normalizedCode).digest('hex');
  await Promise.all([
    doc('coupons', id).set({
      code: normalizedCode,
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 0,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
      usageLimit,
      usageCount,
      perUserLimit,
      isActive: true,
    }),
    doc('couponCodes', codeId).set({ couponId: id }),
  ]);
  return { id, code: normalizedCode, codeId };
}

async function seedProduct({ id = newId('product'), sellerId = newId('seller'), stock = 30 } = {}) {
  await registerSeller(sellerId);
  await doc('products', id).set({
    title: 'Emulator Lifecycle Product',
    slug: id.toLowerCase(),
    description: 'Local emulator fixture product',
    price: 1000,
    stock,
    salesCount: 0,
    status: 'active',
    sellerId,
    sellerStoreName: 'Local Emulator Seller',
    images: [],
  });
  return { id, sellerId };
}

async function seedUsage({ couponId, customerId, orderId, state, occupiedCount = 1, paymentMethod = 'cod' }) {
  const refs = getCouponUserUsageRefs(adminDb, couponId, customerId, orderId);
  ownedUsageRefs.set(refs.usageRef.path, refs.usageRef);
  track(refs.reservationRef);
  await Promise.all([
    refs.usageRef.set({ state: 'ready', couponId, customerId, occupiedCount, updatedAt: new Date().toISOString() }),
    refs.reservationRef.set({ orderId, couponId, customerId, paymentMethod, state, createdAt: new Date().toISOString() }),
  ]);
  return refs;
}

function checkoutRequestId() {
  return newId('checkout_request');
}

function checkoutPayload({ requestId, productId, couponCode, addressSuffix = newId('addr') }) {
  return {
    checkoutRequestId: requestId,
    paymentMethod: 'cod',
    couponCode,
    customerDetails: { name: 'Local Emulator Customer', email: 'customer@example.invalid', phone: '+919876543210' },
    shippingAddress: {
      fullName: 'Local Emulator Customer',
      phoneNumber: '+919876543210',
      addressLine1: `1 ${addressSuffix}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
    },
    items: [{ productId, quantity: 1 }],
  };
}

async function submitCheckout(customerId, payload) {
  track(doc('checkoutRequests', `${customerId}_${payload.checkoutRequestId}`));
  track(getCheckoutCoordinationRef(customerId));
  track(doc('carts', customerId));
  return createOrder(sessionRequest(customerId, payload));
}

async function seedLifecycleOrder({
  orderId = newId('order'),
  customerId = newId('customer'),
  sellerId = newId('seller'),
  productId = newId('product'),
  couponId = newId('coupon'),
  paymentMethod = 'cod',
  paymentStatus = 'pending',
  fulfillmentStatus = 'pending',
  orderStatus = 'confirmed',
  reservationState = 'awaiting_delivery',
  occupiedCount = 1,
  razorpayOrderId,
} = {}) {
  await registerCustomer(customerId);
  await registerSeller(sellerId);
  const orderRef = doc('orders', orderId);
  const productRef = doc('products', productId);
  await Promise.all([
    productRef.set({ title: 'Lifecycle fixture', stock: 9, salesCount: 1, status: 'active', sellerId }),
    orderRef.set({
      orderNumber: orderId,
      customerId,
      sellerIds: [sellerId],
      couponApplied: { couponId, code: 'LOCAL10', discountAmount: 100 },
      pricing: { totalAmount: 125 },
      payment: {
        method: paymentMethod,
        status: paymentStatus,
        ...(razorpayOrderId ? { razorpayOrderId } : {}),
      },
      orderStatus,
      cancellationStatus: 'none',
      items: [{ productId, sellerId, title: 'Lifecycle fixture', quantity: 1, price: 1000, fulfillmentStatus }],
      statusTimeline: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  ]);
  const usageRefs = await seedUsage({ couponId, customerId, orderId, state: reservationState, occupiedCount, paymentMethod });
  return { orderId, customerId, sellerId, productId, couponId, orderRef, productRef, ...usageRefs };
}

async function firestoreValue(ref) {
  const snapshot = await ref.get();
  return snapshot.exists ? snapshot.data() : undefined;
}

function fulfillmentRequest(sellerId, fulfillmentStatus, extra = {}) {
  return sessionRequest(sellerId, { fulfillmentStatus, ...extra });
}

function webhookRequest(payment) {
  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: payment } },
  });
  const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return {
    text: async () => rawBody,
    headers: { get: (name) => name.toLowerCase() === 'x-razorpay-signature' ? signature : null },
  };
}

async function cleanupOwnedDocuments() {
  // Discover route-created orders/notifications only through unique test-owned identities.
  const discovered = [];
  for (const customerId of ownedCustomers) {
    const snapshot = await adminDb.collection('orders').where('customerId', '==', customerId).get();
    discovered.push(...snapshot.docs.map(({ ref }) => ref));
  }
  const notificationIds = [...ownedUsers];
  const notificationRefs = [];
  for (const userId of notificationIds) {
    const snapshot = await adminDb.collection('notifications').where('userId', '==', userId).get();
    notificationRefs.push(...snapshot.docs.map(({ ref }) => ref));
  }
  for (const usageRef of ownedUsageRefs.values()) {
    const reservations = await usageRef.collection('reservations').get();
    discovered.push(...reservations.docs.map(({ ref }) => ref));
  }
  const allRefs = new Map(ownedRefs);
  for (const ref of [...discovered, ...notificationRefs]) allRefs.set(ref.path, ref);
  const failures = (await Promise.all([...allRefs.values()].map(async (ref) => {
    try {
      await ref.delete();
      return null;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return { path: ref.path, message };
    }
  }))).filter(Boolean);
  if (failures.length > 0) {
    const details = failures.map(({ path, message }) => `- ${path}: ${message}`).join('\n');
    throw new Error(`Failed to clean up ${failures.length} emulator fixture document(s):\n${details}`);
  }
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18080');
  assert.equal(adminApp.options.projectId, 'demo-casaio-rules');
  authMock = mock.method(adminAuth, 'verifySessionCookie', async (token) => {
    const uid = typeof token === 'string' ? token.replace(/^local-session:/, '') : '';
    return { uid, email: `${uid}@example.invalid` };
  });
});

after(async () => {
  let cleanupError;
  try {
    await cleanupOwnedDocuments();
  } catch (error) {
    cleanupError = error;
  } finally {
    mock.restoreAll();
    void authMock;
  }
  // node:test reports this after-hook error independently from failed test cases,
  // preserving both the original assertions and any cleanup diagnostics.
  if (cleanupError) throw cleanupError;
});

test('two customers competing for the final global coupon use leave exactly one reservation', async () => {
  const coupon = await seedCoupon({ usageLimit: 1, perUserLimit: 1 });
  const product = await seedProduct();
  const customers = [newId('customer'), newId('customer')];
  await Promise.all(customers.map(registerCustomer));
  const responses = await Promise.all(customers.map((customerId) => submitCheckout(customerId, checkoutPayload({
    requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code,
  }))));

  const outcomes = await Promise.all(responses.map(async (response) => ({
    status: response.status,
    body: await response.json(),
  })));
  assert.deepEqual(
    outcomes.map(({ status }) => status).sort(),
    [200, 400],
    `concurrent checkout outcomes: ${JSON.stringify(outcomes)}`,
  );
  const rejected = outcomes.find(({ status }) => status === 400);
  assert.match(
    rejected?.body?.error || '',
    /usage limit has been reached/i,
    `rejected checkout must report global coupon exhaustion: ${JSON.stringify(outcomes)}`,
  );
  assert.equal((await firestoreValue(doc('coupons', coupon.id))).usageCount, 1);
  const usage = await Promise.all(customers.map(async (customerId) => firestoreValue(
    doc('couponUserUsage', getCouponUserUsageKey(coupon.id, customerId)),
  )));
  assert.equal(usage.filter((value) => value?.occupiedCount === 1).length, 1);
  assert.equal(usage.filter((value) => value === undefined).length, 1);
});

test('two simultaneous checkouts for one customer cannot occupy the final per-user slot twice', async () => {
  const coupon = await seedCoupon({ usageLimit: 5, perUserLimit: 1 });
  const product = await seedProduct();
  const customerId = newId('customer');
  await registerCustomer(customerId);
  const responses = await Promise.all([
    submitCheckout(customerId, checkoutPayload({ requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code, addressSuffix: 'race-a' })),
    submitCheckout(customerId, checkoutPayload({ requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code, addressSuffix: 'race-b' })),
  ]);

  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await firestoreValue(doc('coupons', coupon.id))).usageCount, 1);
  const usageRef = doc('couponUserUsage', getCouponUserUsageKey(coupon.id, customerId));
  assert.equal((await firestoreValue(usageRef)).occupiedCount, 1);
  const reservations = await usageRef.collection('reservations').get();
  assert.equal(reservations.size, 1);
  assert.equal(reservations.docs[0].data().state, 'awaiting_delivery');
});

test('concurrent checkouts initialize one missing legacy usage ledger without losing either reservation', async () => {
  const coupon = await seedCoupon({ usageLimit: 5, perUserLimit: 3 });
  const product = await seedProduct();
  const customerId = newId('customer');
  await registerCustomer(customerId);
  const responses = await Promise.all([
    submitCheckout(customerId, checkoutPayload({ requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code, addressSuffix: 'ledger-a' })),
    submitCheckout(customerId, checkoutPayload({ requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code, addressSuffix: 'ledger-b' })),
  ]);

  assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
  assert.equal((await firestoreValue(doc('coupons', coupon.id))).usageCount, 2);
  const usageRef = doc('couponUserUsage', getCouponUserUsageKey(coupon.id, customerId));
  const usage = await firestoreValue(usageRef);
  assert.equal(usage.state, 'ready');
  assert.equal(usage.occupiedCount, 2);
  const reservations = await usageRef.collection('reservations').get();
  assert.equal(reservations.size, 2);
  assert.ok(reservations.docs.every((snapshot) => snapshot.data().state === 'awaiting_delivery'));
});

test('duplicate checkout request IDs return one persisted order and consume one coupon use', async () => {
  const coupon = await seedCoupon({ usageLimit: 3, perUserLimit: 2 });
  const product = await seedProduct();
  const customerId = newId('customer');
  await registerCustomer(customerId);
  const payload = checkoutPayload({ requestId: checkoutRequestId(), productId: product.id, couponCode: coupon.code });
  const responses = await Promise.all([
    submitCheckout(customerId, payload),
    submitCheckout(customerId, payload),
  ]);
  const bodies = await Promise.all(responses.map(responseData));

  assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
  assert.equal(bodies[0].orderId, bodies[1].orderId);
  assert.equal((await firestoreValue(doc('coupons', coupon.id))).usageCount, 1);
  const usageRef = doc('couponUserUsage', getCouponUserUsageKey(coupon.id, customerId));
  assert.equal((await firestoreValue(usageRef)).occupiedCount, 1);
  assert.equal((await usageRef.collection('reservations').get()).size, 1);
});

test('concurrent verification and webhook captures persist one payment and consume one reservation', async () => {
  const orderId = newId('order');
  const customerId = newId('customer');
  const couponId = newId('coupon');
  const razorpayOrderId = `order_test_${newId('synthetic')}`;
  const paymentId = `pay_test_${newId('synthetic')}`;
  const fixture = await seedLifecycleOrder({
    orderId, customerId, couponId, paymentMethod: 'razorpay', paymentStatus: 'pending',
    fulfillmentStatus: 'pending', orderStatus: 'pending', reservationState: 'reserved', razorpayOrderId,
  });
  const activeAttemptRef = track(getActivePaymentAttemptRef(customerId));
  await activeAttemptRef.set({ userId: customerId, orderId, orderNumber: orderId });
  fakePayments.set(paymentId, {
    id: paymentId,
    order_id: razorpayOrderId,
    amount: 12500,
    currency: 'INR',
    status: 'captured',
  });
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`).digest('hex');

  const [verification, webhook] = await Promise.all([
    verifyPayment(sessionRequest(customerId, { orderId, razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: signature })),
    paymentWebhook(webhookRequest({ id: paymentId, order_id: razorpayOrderId, amount: 12500, currency: 'INR', status: 'captured' })),
  ]);

  assert.equal(verification.status, 200);
  assert.equal(webhook.status, 200);
  const order = await firestoreValue(fixture.orderRef);
  assert.equal(order.payment.status, 'captured');
  assert.equal(order.payment.razorpayPaymentId, paymentId);
  assert.equal(order.statusTimeline.length, 1);
  assert.equal((await firestoreValue(activeAttemptRef)), undefined);
  assert.equal((await firestoreValue(fixture.usageRef)).occupiedCount, 1);
  assert.equal((await firestoreValue(fixture.reservationRef)).state, 'consumed');
  fakePayments.delete(paymentId);
});

test('concurrent COD delivery requests consume an existing reservation exactly once', async () => {
  const fixture = await seedLifecycleOrder({
    fulfillmentStatus: 'out_for_delivery', orderStatus: 'out_for_delivery', reservationState: 'awaiting_delivery',
  });
  const params = Promise.resolve({ orderId: fixture.orderId });
  const [first, second] = await Promise.all([
    updateFulfillment(fulfillmentRequest(fixture.sellerId, 'delivered'), { params }),
    updateFulfillment(fulfillmentRequest(fixture.sellerId, 'delivered'), { params }),
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await firestoreValue(fixture.orderRef)).orderStatus, 'delivered');
  assert.equal((await firestoreValue(fixture.usageRef)).occupiedCount, 1);
  assert.equal((await firestoreValue(fixture.reservationRef)).state, 'consumed');
});

test('concurrent COD cancellation requests release an existing reservation exactly once', async () => {
  const fixture = await seedLifecycleOrder({
    fulfillmentStatus: 'pending', orderStatus: 'confirmed', reservationState: 'awaiting_delivery',
  });
  const params = Promise.resolve({ orderId: fixture.orderId });
  const responses = await Promise.all([
    cancelOrder(sessionRequest(fixture.customerId), { params }),
    cancelOrder(sessionRequest(fixture.customerId), { params }),
  ]);

  assert.ok(responses.some(({ status }) => status === 200));
  assert.ok(responses.every(({ status }) => status === 200 || status === 409));
  const order = await firestoreValue(fixture.orderRef);
  assert.equal(order.orderStatus, 'cancelled');
  assert.equal(order.cancellationStatus, 'completed');
  assert.equal((await firestoreValue(fixture.usageRef)).occupiedCount, 0);
  assert.equal((await firestoreValue(fixture.reservationRef)).state, 'released');
  const retry = await cancelOrder(sessionRequest(fixture.customerId), { params });
  assert.equal(retry.status, 200);
  assert.equal((await firestoreValue(fixture.usageRef)).occupiedCount, 0);
  assert.equal((await firestoreValue(fixture.reservationRef)).state, 'released');
});

test('concurrent COD delivery attempt and cancellation from out-for-delivery preserve valid lifecycle state', async () => {
  const fixture = await seedLifecycleOrder({
    fulfillmentStatus: 'out_for_delivery', orderStatus: 'out_for_delivery', reservationState: 'awaiting_delivery',
  });
  const params = Promise.resolve({ orderId: fixture.orderId });
  const [delivery, cancellation] = await Promise.all([
    updateFulfillment(fulfillmentRequest(fixture.sellerId, 'delivered'), { params }),
    cancelOrder(sessionRequest(fixture.customerId), { params }),
  ]);

  // Cancellation is already outside its allowed lifecycle window here; delivery
  // is the only event that can validly transition this seeded state.
  assert.equal(delivery.status, 200);
  assert.equal(cancellation.status, 409);
  assert.equal((await firestoreValue(fixture.orderRef)).orderStatus, 'delivered');
  assert.equal((await firestoreValue(fixture.orderRef)).cancellationStatus, 'none');
  assert.equal((await firestoreValue(fixture.usageRef)).occupiedCount, 1);
  assert.equal((await firestoreValue(fixture.reservationRef)).state, 'consumed');
});

test('concurrent COD fulfillment advancement and cancellation converge on a valid reservation state', async () => {
  const fixture = await seedLifecycleOrder({
    fulfillmentStatus: 'pending', orderStatus: 'confirmed', reservationState: 'awaiting_delivery',
  });
  const params = Promise.resolve({ orderId: fixture.orderId });
  const [fulfillment, cancellation] = await Promise.all([
    updateFulfillment(fulfillmentRequest(fixture.sellerId, 'processing'), { params }),
    cancelOrder(sessionRequest(fixture.customerId), { params }),
  ]);
  assert.ok(fulfillment.status === 200 || cancellation.status === 200);

  const order = await firestoreValue(fixture.orderRef);
  const reservation = await firestoreValue(fixture.reservationRef);
  const usage = await firestoreValue(fixture.usageRef);
  if (order.orderStatus === 'cancelled') {
    assert.equal(order.cancellationStatus, 'completed');
    assert.equal(reservation.state, 'released');
    assert.equal(usage.occupiedCount, 0);
    assert.ok(fulfillment.status !== 200);
  } else {
    assert.equal(order.orderStatus, 'confirmed');
    assert.equal(order.items[0].fulfillmentStatus, 'processing');
    assert.equal(reservation.state, 'awaiting_delivery');
    assert.equal(usage.occupiedCount, 1);
    assert.ok(cancellation.status !== 200);
  }
});

test('real Firestore transaction retry under a read conflict preserves both increments', async () => {
  const counterRef = doc('emulatorTransactionContention', newId('counter'));
  await counterRef.set({ value: 0 });
  let firstReads = 0;
  let releaseBothReads;
  const bothRead = new Promise((resolveBoth) => { releaseBothReads = resolveBoth; });
  const callbackCounts = [0, 0];

  const increment = (index) => adminDb.runTransaction(async (transaction) => {
    callbackCounts[index] += 1;
    const snapshot = await transaction.get(counterRef);
    if (callbackCounts[index] === 1) {
      firstReads += 1;
      if (firstReads === 2) releaseBothReads();
      await bothRead;
    }
    transaction.update(counterRef, { value: snapshot.data().value + 1 });
  });
  await Promise.all([increment(0), increment(1)]);

  assert.equal((await firestoreValue(counterRef)).value, 2);
  assert.ok(callbackCounts.reduce((total, count) => total + count, 0) >= 3, `expected SDK retry, callbacks=${callbackCounts}`);
});
