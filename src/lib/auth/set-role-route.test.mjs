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
const { POST } = await import('@/app/api/auth/set-role/route');
Module._resolveFilename = originalResolveFilename;

const actorUid = 'admin-local-1';
const targetUid = 'customer-local-1';
let documents;
let auditEntries;
let authCalls;
let options;

function snapshot(value) {
  return { exists: value !== undefined, data: () => value && structuredClone(value) };
}

function request(body, { session = 'valid-session', bootstrapHeader } = {}) {
  return {
    cookies: { get: (name) => name === 'casaio_session' && session ? { value: session } : undefined },
    headers: { get: (name) => name.toLowerCase() === 'x-admin-bootstrap-secret' ? bootstrapHeader ?? null : null },
    json: async () => body,
  };
}

function makeRef(collectionName, id) {
  const path = `${collectionName}/${id}`;
  return { collectionName, id, path, get: async () => snapshot(documents.get(path)) };
}

beforeEach(() => {
  mock.restoreAll();
  documents = new Map([
    [`users/${actorUid}`, { uid: actorUid, role: 'admin', status: 'active' }],
    [`users/${targetUid}`, { uid: targetUid, role: 'customer', status: 'active' }],
  ]);
  auditEntries = [];
  authCalls = [];
  options = { targetAuthExists: true, failAudit: false, failClaims: false, sessionError: false };

  mock.method(adminAuth, 'verifySessionCookie', async (_session, checkRevoked) => {
    authCalls.push(['verifySessionCookie', checkRevoked]);
    if (options.sessionError) throw Object.assign(new Error('private verification detail'), { code: 'auth/id-token-revoked' });
    return { uid: actorUid, email: 'admin@example.invalid' };
  });
  mock.method(adminAuth, 'getUser', async (uid) => {
    authCalls.push(['getUser', uid]);
    if (!options.targetAuthExists) throw Object.assign(new Error('private user lookup detail'), { code: 'auth/user-not-found' });
    return { uid, customClaims: { existingClaim: 'preserved' } };
  });
  mock.method(adminAuth, 'setCustomUserClaims', async (uid, claims) => {
    authCalls.push(['setCustomUserClaims', uid, claims]);
    if (options.failClaims) throw Object.assign(new Error('private claims detail'), { code: 'auth/internal-error' });
  });
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id = `generated-${auditEntries.length + 1}`) => makeRef(name, id),
  }));
  mock.method(adminDb, 'runTransaction', async (callback) => {
    const writes = [];
    const transaction = {
      get: async (ref) => snapshot(documents.get(ref.path)),
      update: (ref, value) => writes.push(() => {
        const current = structuredClone(documents.get(ref.path));
        Object.assign(current, value);
        documents.set(ref.path, current);
      }),
      create: (ref, value) => {
        if (options.failAudit) throw Object.assign(new Error('private audit failure detail'), { code: 'firestore/unavailable' });
        writes.push(() => auditEntries.push({ path: ref.path, value: structuredClone(value) }));
      },
    };
    const result = await callback(transaction);
    writes.forEach((write) => write());
    return result;
  });
});

test('bootstrap header never authorizes a role change without an active admin session', async () => {
  const response = await POST(request({ targetUid, role: 'admin' }, { session: null, bootstrapHeader: 'synthetic-test-header' }));

  assert.equal(response.status, 403);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);
});

test('active session admin changes the role and writes a durable audit record', async () => {
  const response = await POST(request({ targetUid, role: 'seller' }));

  assert.equal(response.status, 200);
  assert.equal(documents.get(`users/${targetUid}`).role, 'seller');
  assert.deepEqual(authCalls[0], ['verifySessionCookie', true]);
  assert.deepEqual(authCalls.at(-1), ['setCustomUserClaims', targetUid, { existingClaim: 'preserved', role: 'seller' }]);
  assert.equal(auditEntries.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(auditEntries[0].value).filter(([key]) => key !== 'timestamp')),
    { actorUid, targetUid, previousRole: 'customer', newRole: 'seller' },
  );
  assert.ok(auditEntries[0].value.timestamp);
});

test('repeating the same role does not create another audit record', async () => {
  const first = await POST(request({ targetUid, role: 'seller' }));
  const second = await POST(request({ targetUid, role: 'seller' }));

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(documents.get(`users/${targetUid}`).role, 'seller');
  assert.equal(auditEntries.length, 1);
});

test('non-admin and suspended requesters are rejected without modifying the target', async () => {
  documents.set(`users/${actorUid}`, { uid: actorUid, role: 'customer', status: 'active' });
  const nonAdmin = await POST(request({ targetUid, role: 'admin' }));
  assert.equal(nonAdmin.status, 403);
  assert.equal(authCalls.some(([name]) => name === 'getUser'), false);

  mock.restoreAll();
  documents.set(`users/${actorUid}`, { uid: actorUid, role: 'admin', status: 'suspended' });
  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: actorUid }));
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id) => makeRef(name, id),
  }));
  const suspended = await POST(request({ targetUid, role: 'admin' }));
  assert.equal(suspended.status, 403);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
});

test('invalid and revoked sessions are rejected with revocation checking enabled', async () => {
  options.sessionError = true;
  const response = await POST(request({ targetUid, role: 'admin' }));

  assert.equal(response.status, 403);
  assert.deepEqual(authCalls[0], ['verifySessionCookie', true]);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'getUser'), false);
});

test('invalid roles and target UIDs are rejected before Auth or Firestore writes', async () => {
  for (const body of [
    { targetUid, role: 'owner' },
    { targetUid: '../admin', role: 'admin' },
    { targetUid: ' target-with-space ', role: 'admin' },
    { targetUid: 'x'.repeat(129), role: 'admin' },
    { role: 'admin' },
    { targetUid, role: 'seller', unexpected: true },
  ]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(authCalls.some(([name]) => name === 'getUser'), false);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
});

test('nonexistent Auth accounts and missing Firestore profiles are rejected without writes', async () => {
  options.targetAuthExists = false;
  const noAuthUser = await POST(request({ targetUid, role: 'admin' }));
  assert.equal(noAuthUser.status, 404);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);

  options.targetAuthExists = true;
  documents.delete(`users/${targetUid}`);
  const noProfile = await POST(request({ targetUid, role: 'admin' }));
  assert.equal(noProfile.status, 404);
  assert.equal(auditEntries.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);
});

test('audit transaction failures do not change the profile or claims and return a generic error', async () => {
  options.failAudit = true;
  const response = await POST(request({ targetUid, role: 'admin' }));
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, { error: 'Unable to update user role' });
  assert.equal(JSON.stringify(payload).includes('private audit failure detail'), false);
  assert.equal(documents.get(`users/${targetUid}`).role, 'customer');
  assert.equal(auditEntries.length, 0);
  assert.equal(authCalls.some(([name]) => name === 'setCustomUserClaims'), false);
});

test('claim synchronization failure is logged safely and can be retried without duplicate audit', async () => {
  options.failClaims = true;
  const response = await POST(request({ targetUid, role: 'admin' }));
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, { error: 'Role updated; authentication settings require retry' });
  assert.equal(JSON.stringify(payload).includes('private claims detail'), false);
  assert.equal(documents.get(`users/${targetUid}`).role, 'admin');
  assert.equal(auditEntries.length, 1);

  options.failClaims = false;
  const retry = await POST(request({ targetUid, role: 'admin' }));
  assert.equal(retry.status, 200);
  assert.equal(auditEntries.length, 1);
});

