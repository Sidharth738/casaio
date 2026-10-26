import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';

// Keep this test process on the explicitly pinned demo configuration. The
// Admin SDK methods are mocked below, so the route test cannot contact Firebase.
Object.assign(process.env, {
  NODE_ENV: 'development',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  GCLOUD_PROJECT: 'demo-casaio-rules',
  GOOGLE_CLOUD_PROJECT: 'demo-casaio-rules',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
});

const { adminApp, adminAuth, adminDb } = await import('@/lib/firebase/admin');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
const { POST } = await import('@/app/api/auth/session/route');
Module._resolveFilename = originalResolveFilename;

let calls;
let userProfile;
let accountExists;
let verifyTokenError;
let tokenEmailVerified;
let transactionQueue;

function request(body) {
  return { json: async () => body };
}

beforeEach(() => {
  mock.restoreAll();
  calls = [];
  userProfile = undefined;
  accountExists = false;
  verifyTokenError = undefined;
  tokenEmailVerified = true;
  transactionQueue = Promise.resolve();

  mock.method(adminAuth, 'verifyIdToken', async (token) => {
    calls.push(['verifyIdToken', token]);
    if (verifyTokenError) throw verifyTokenError;
    return {
      uid: 'synthetic-emulator-user',
      email: 'browser-test@example.invalid',
      name: 'Browser Test',
      picture: 'https://example.invalid/avatar.png',
      email_verified: tokenEmailVerified,
      firebase: { sign_in_provider: 'password' },
    };
  });
  mock.method(adminAuth, 'createSessionCookie', async (token, options) => {
    calls.push(['createSessionCookie', token, options]);
    return 'synthetic-session-cookie';
  });
  mock.method(adminDb, 'collection', (collection) => ({
    doc: (uid) => ({ collection, uid }),
  }));
  mock.method(adminDb, 'runTransaction', async (operation) => {
    let release;
    const previous = transactionQueue;
    transactionQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation({
        get: async () => ({ exists: accountExists, data: () => userProfile }),
        create: (_reference, profile) => {
          calls.push(['createProfile', _reference.collection, _reference.uid]);
          userProfile = structuredClone(profile);
          accountExists = true;
        },
      });
    } finally {
      release();
    }
  });
});

test('session route Admin SDK is pinned to the demo project and loopback emulators', () => {
  assert.equal(adminApp.options.projectId, 'demo-casaio-rules');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18080');
  assert.equal(process.env.STORAGE_EMULATOR_HOST, 'http://127.0.0.1:9199');
});

test('verifies a synthetic Firebase ID token and creates a customer session cookie', async () => {
  const response = await POST(request({ idToken: 'synthetic-emulator-issued-id-token' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    user: { uid: 'synthetic-emulator-user', email: 'browser-test@example.invalid', role: 'customer' },
  });
  assert.deepEqual(calls.map(([name]) => name), ['verifyIdToken', 'createProfile', 'createSessionCookie']);
  assert.deepEqual(calls[0], ['verifyIdToken', 'synthetic-emulator-issued-id-token']);
  assert.equal(calls[2][1], 'synthetic-emulator-issued-id-token');
  assert.equal(calls[2][2].expiresIn, 5 * 24 * 60 * 60 * 1000);
  assert.equal(userProfile.uid, 'synthetic-emulator-user');
  assert.equal(userProfile.role, 'customer');

  const sessionCookie = response.cookies.get('casaio_session');
  assert.equal(sessionCookie.value, 'synthetic-session-cookie');
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.secure, false);
  assert.equal(sessionCookie.sameSite, 'lax');
  assert.equal(sessionCookie.path, '/');
});

test('does not create a session when Admin ID-token verification rejects the token', async () => {
  verifyTokenError = Object.assign(new Error('synthetic invalid token'), { code: 'auth/argument-error' });

  const response = await POST(request({ idToken: 'invalid-synthetic-token' }));

  assert.equal(response.status, 401);
  assert.deepEqual(calls, [['verifyIdToken', 'invalid-synthetic-token']]);
});

test('preserves an existing profile and its role instead of bootstrapping over it', async () => {
  accountExists = true;
  userProfile = {
    uid: 'synthetic-emulator-user',
    email: 'browser-test@example.invalid',
    displayName: 'Existing Profile',
    role: 'seller',
    status: 'active',
    createdAt: 'original-created-at',
  };

  const response = await POST(request({ idToken: 'synthetic-emulator-issued-id-token' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.role, 'seller');
  assert.equal(userProfile.displayName, 'Existing Profile');
  assert.equal(userProfile.createdAt, 'original-created-at');
  assert.equal(calls.some(([name]) => name === 'createProfile'), false);
});

test('rejects an unverified password account without creating its profile or session', async () => {
  tokenEmailVerified = false;

  const response = await POST(request({ idToken: 'unverified-synthetic-token' }));
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, 'auth/email-not-verified');
  assert.equal(accountExists, false);
  assert.equal(calls.some(([name]) => name === 'createProfile'), false);
  assert.equal(calls.some(([name]) => name === 'createSessionCookie'), false);
});

test('concurrent session requests create a missing profile once and preserve it on the next request', async () => {
  const [first, second] = await Promise.all([
    POST(request({ idToken: 'synthetic-first-token' })),
    POST(request({ idToken: 'synthetic-second-token' })),
  ]);
  const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.user.role, 'customer');
  assert.equal(secondBody.user.role, 'customer');
  assert.equal(calls.filter(([name]) => name === 'createProfile').length, 1);
  assert.equal(userProfile.uid, 'synthetic-emulator-user');
  assert.equal(userProfile.role, 'customer');
});
