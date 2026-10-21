import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { getCouponUserUsageKey } from '@/lib/coupons/user-usage';

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
const { POST } = await import('@/app/api/orders/[orderId]/cancel/route');
Module._resolveFilename = originalResolveFilename;

test('COD cancellation releases its held coupon slot once', async () => {
  const userId = 'customer-cancel-coupon';
  const orderId = 'order-cancel-coupon';
  const couponId = 'coupon-stable-id';
  const usagePath = `couponUserUsage/${getCouponUserUsageKey(couponId, userId)}`;
  const reservationPath = `${usagePath}/reservations/${orderId}`;
  const records = new Map([
    [`users/${userId}`, { role: 'customer', status: 'active' }],
    [`orders/${orderId}`, {
      customerId: userId,
      couponApplied: { couponId, code: 'SAVE10', discountAmount: 100 },
      payment: { method: 'cod', status: 'pending' },
      orderStatus: 'confirmed',
      cancellationStatus: 'none',
      items: [{ productId: 'product-1', quantity: 1, fulfillmentStatus: 'pending' }],
      statusTimeline: [],
    }],
    [`products/product-1`, { stock: 1, salesCount: 1, status: 'active' }],
    [usagePath, { state: 'ready', couponId, customerId: userId, occupiedCount: 1 }],
    [reservationPath, { orderId, couponId, customerId: userId, paymentMethod: 'cod', state: 'awaiting_delivery' }],
  ]);

  const ref = (path) => ({
    id: path.split('/').at(-1),
    path,
    get parent() {
      const parts = path.split('/');
      return { parent: parts.length >= 4 ? ref(parts.slice(0, -2).join('/')) : null };
    },
    get: async () => ({ exists: records.has(path), data: () => structuredClone(records.get(path)) }),
    update: async (changes) => records.set(path, { ...(records.get(path) || {}), ...changes }),
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });

  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: userId, email: 'customer@example.invalid' }));
  mock.method(adminDb, 'collection', (name) => ({ doc: (id) => ref(`${name}/${id}`) }));
  mock.method(adminDb, 'runTransaction', async (callback) => {
    const writes = [];
    const result = await callback({
      get: async (documentRef) => ({ exists: records.has(documentRef.path), data: () => structuredClone(records.get(documentRef.path)) }),
      update: (documentRef, changes) => writes.push(() => {
        const current = structuredClone(records.get(documentRef.path) || {});
        for (const [field, value] of Object.entries(changes)) {
          const pathParts = field.split('.');
          let target = current;
          for (const part of pathParts.slice(0, -1)) target = target[part] ??= {};
          target[pathParts.at(-1)] = value;
        }
        records.set(documentRef.path, current);
      }),
      delete: (documentRef) => writes.push(() => records.delete(documentRef.path)),
    });
    writes.forEach((write) => write());
    return result;
  });

  const request = { cookies: { get: (name) => name === 'casaio_session' ? { value: 'fake-session' } : undefined } };
  const params = Promise.resolve({ orderId });
  const first = await POST(request, { params });
  assert.equal(first.status, 200);
  assert.equal(records.get(usagePath).occupiedCount, 0);
  assert.equal(records.get(reservationPath).state, 'released');

  const retry = await POST(request, { params });
  assert.equal(retry.status, 200);
  assert.equal(records.get(usagePath).occupiedCount, 0);
  assert.equal(records.get(reservationPath).state, 'released');
  mock.restoreAll();
});
