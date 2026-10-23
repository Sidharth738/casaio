import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
const { POST: updateUser } = await import('@/app/api/admin/users/[id]/route');
const { POST: updateSellerStatus } = await import('@/app/api/admin/sellers/[id]/status/route');
Module._resolveFilename = originalResolveFilename;

const actorUid = 'admin-role-test';
const targetUid = 'user-role-test';
let records;
let audits;
let authCalls;
let notifications;
let options;

function snapshot(value) {
  return { exists: value !== undefined, data: () => value && structuredClone(value) };
}

function ref(collectionName, id) {
  const path = `${collectionName}/${id}`;
  return {
    id,
    path,
    get: async () => snapshot(records.get(path)),
  };
}

function request(body) {
  return {
    cookies: { get: (name) => name === 'casaio_session' ? { value: 'admin-session' } : undefined },
    json: async () => body,
  };
}

const routeContext = { params: Promise.resolve({ id: targetUid }) };

beforeEach(() => {
  mock.restoreAll();
  records = new Map([
    [`users/${actorUid}`, { uid: actorUid, role: 'admin', status: 'active' }],
    [`users/${targetUid}`, { uid: targetUid, role: 'customer', status: 'active' }],
    [`sellers/${targetUid}`, {
      status: 'pending',
      commissionRatePercent: 25,
      metrics: { totalSalesAmount: 17, totalOrdersCount: 2, ratingAverage: 4, ratingCount: 3 },
    }],
  ]);
  audits = [];
  authCalls = [];
  notifications = [];
  options = { failTransaction: false, failClaims: false, failDisabledUpdate: false, failRevocation: false };

  mock.method(adminAuth, 'verifySessionCookie', async (_cookie, checkRevoked) => {
    authCalls.push(['verifySessionCookie', checkRevoked]);
    return { uid: actorUid, email: 'admin@example.invalid' };
  });
  mock.method(adminAuth, 'getUser', async (uid) => {
    authCalls.push(['getUser', uid]);
    return { uid, customClaims: { preservedClaim: 'yes' } };
  });
  mock.method(adminAuth, 'setCustomUserClaims', async (uid, claims) => {
    authCalls.push(['setCustomUserClaims', uid, claims]);
    if (options.failClaims) throw Object.assign(new Error('private claims failure'), { code: 'auth/internal-error' });
  });
  mock.method(adminAuth, 'updateUser', async (uid, changes) => {
    authCalls.push(['updateUser', uid, changes]);
    if (options.failDisabledUpdate) throw Object.assign(new Error('private disabled update failure'), { code: 'auth/internal-error' });
  });
  mock.method(adminAuth, 'revokeRefreshTokens', async (uid) => {
    authCalls.push(['revokeRefreshTokens', uid]);
    if (options.failRevocation) throw Object.assign(new Error('private revocation failure'), { code: 'auth/internal-error' });
  });
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id = `audit-${audits.length + 1}`) => ref(name, id),
    add: async (value) => {
      notifications.push(value);
      return ref(name, `notification-${notifications.length}`);
    },
  }));
  mock.method(adminDb, 'runTransaction', async (callback) => {
    const writes = [];
    const transaction = {
      get: async (documentRef) => snapshot(records.get(documentRef.path)),
      update: (documentRef, updates) => writes.push(() => {
        const current = structuredClone(records.get(documentRef.path));
        Object.assign(current, updates);
        records.set(documentRef.path, current);
      }),
      create: (documentRef, value) => {
        if (options.failTransaction) throw Object.assign(new Error('private transaction failure'), { code: 'firestore/unavailable' });
        writes.push(() => audits.push({ path: documentRef.path, value: structuredClone(value) }));
      },
    };
    const result = await callback(transaction);
    writes.forEach((write) => write());
    return result;
  });
});

function assertAudit({ actor = actorUid, previousRole, newRole }) {
  assert.equal(audits.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(audits[0].value).filter(([key]) => key !== 'timestamp')),
    { actorUid: actor, targetUid, previousRole, newRole },
  );
  assert.ok(audits[0].value.timestamp);
}

test('admin user route audits role changes and preserves unrelated custom claims', async () => {
  const response = await updateUser(request({ role: 'seller' }), routeContext);

  assert.equal(response.status, 200);
  assert.equal(records.get(`users/${targetUid}`).role, 'seller');
  assert.deepEqual(authCalls.at(-1), ['setCustomUserClaims', targetUid, { preservedClaim: 'yes', role: 'seller' }]);
  assertAudit({ previousRole: 'customer', newRole: 'seller' });
});

test('admin user route does not duplicate audit records for unchanged roles', async () => {
  await updateUser(request({ role: 'seller' }), routeContext);
  const response = await updateUser(request({ role: 'seller' }), routeContext);

  assert.equal(response.status, 200);
  assert.equal(audits.length, 1);
});

test('admin user route keeps status update and token revocation running when claim sync fails', async () => {
  options.failClaims = true;
  const response = await updateUser(request({ role: 'seller', status: 'suspended' }), routeContext);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, { error: 'User profile was updated; authentication settings require retry' });
  assert.equal(records.get(`users/${targetUid}`).role, 'seller');
  assert.equal(records.get(`users/${targetUid}`).status, 'suspended');
  assert.ok(authCalls.some(([name]) => name === 'updateUser'));
  assert.ok(authCalls.some(([name]) => name === 'revokeRefreshTokens'));
  assertAudit({ previousRole: 'customer', newRole: 'seller' });
});

test('admin user route transaction failure leaves the role and audit unchanged', async () => {
  options.failTransaction = true;
  const response = await updateUser(request({ role: 'admin' }), routeContext);

  assert.equal(response.status, 500);
  assert.equal(records.get(`users/${targetUid}`).role, 'customer');
  assert.equal(audits.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);
});

test('seller approval audits the customer-to-seller transition and preserves approval setup', async () => {
  const response = await updateSellerStatus(request({ status: 'approved' }), routeContext);

  assert.equal(response.status, 200);
  assert.equal(records.get(`sellers/${targetUid}`).status, 'approved');
  assert.equal(records.get(`sellers/${targetUid}`).commissionRatePercent, 10);
  assert.deepEqual(records.get(`sellers/${targetUid}`).metrics, {
    totalSalesAmount: 0, totalOrdersCount: 0, ratingAverage: 5, ratingCount: 0,
  });
  assert.equal(records.get(`users/${targetUid}`).role, 'seller');
  assert.deepEqual(authCalls.find(([name]) => name === 'setCustomUserClaims'), [
    'setCustomUserClaims', targetUid, { preservedClaim: 'yes', role: 'seller' },
  ]);
  assertAudit({ previousRole: 'customer', newRole: 'seller' });
  assert.equal(notifications.length, 1);
});

test('seller status transitions are audited only when the user role changes', async () => {
  await updateSellerStatus(request({ status: 'approved' }), routeContext);
  const repeatApproval = await updateSellerStatus(request({ status: 'approved' }), routeContext);
  assert.equal(repeatApproval.status, 200);
  assert.equal(audits.length, 1);

  const rejected = await updateSellerStatus(request({ status: 'rejected' }), routeContext);
  assert.equal(rejected.status, 200);
  assert.equal(records.get(`sellers/${targetUid}`).status, 'rejected');
  assert.equal(records.get(`users/${targetUid}`).role, 'customer');
  assert.equal(authCalls.some(([name]) => name === 'revokeRefreshTokens'), true);
  assert.equal(audits.length, 2);
  assert.deepEqual(
    Object.fromEntries(Object.entries(audits[1].value).filter(([key]) => key !== 'timestamp')),
    { actorUid, targetUid, previousRole: 'seller', newRole: 'customer' },
  );

  const suspended = await updateSellerStatus(request({ status: 'suspended' }), routeContext);
  assert.equal(suspended.status, 200);
  assert.equal(records.get(`sellers/${targetUid}`).status, 'suspended');
  assert.equal(audits.length, 2);
});

test('seller role claim failure remains observable and does not skip seller status or token revocation', async () => {
  await updateSellerStatus(request({ status: 'approved' }), routeContext);
  options.failClaims = true;
  const response = await updateSellerStatus(request({ status: 'suspended' }), routeContext);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, { error: 'Seller status was updated; authentication settings require retry' });
  assert.equal(records.get(`sellers/${targetUid}`).status, 'suspended');
  assert.equal(records.get(`users/${targetUid}`).role, 'customer');
  assert.ok(authCalls.some(([name]) => name === 'revokeRefreshTokens'));
  assert.equal(audits.length, 2);
});

test('seller transaction failure leaves seller status, user role, and audit unchanged', async () => {
  options.failTransaction = true;
  const response = await updateSellerStatus(request({ status: 'approved' }), routeContext);

  assert.equal(response.status, 500);
  assert.equal(records.get(`sellers/${targetUid}`).status, 'pending');
  assert.equal(records.get(`users/${targetUid}`).role, 'customer');
  assert.equal(audits.length, 0);
  assert.equal(notifications.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);
});

test('user status profile write remains committed when Firebase disabled-state sync fails', async () => {
  options.failDisabledUpdate = true;
  const response = await updateUser(request({ status: 'suspended' }), routeContext);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, { error: 'User profile was updated; authentication settings require retry' });
  assert.equal(records.get(`users/${targetUid}`).status, 'suspended');
  assert.ok(authCalls.some(([name]) => name === 'revokeRefreshTokens'));
  assert.equal(audits.length, 0);
});
