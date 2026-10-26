import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { resolve } from 'node:path';

const projectId = 'demo-casaio-rules';
const authHost = '127.0.0.1:9099';
const firestoreHost = '127.0.0.1:18080';

// This integration test is opt-in and hard-pinned to local emulator endpoints.
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: firestoreHost,
  FIREBASE_AUTH_EMULATOR_HOST: authHost,
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
});

const { adminAuth, adminDb } = await import('@/lib/firebase/admin');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
const { POST } = await import('@/app/api/auth/session/route');
Module._resolveFilename = originalResolveFilename;

const optedIn = process.env.CASAIO_RUN_AUTH_EMULATOR_TESTS === 'true';

test('Auth Emulator-issued ID token verifies and creates a session through the real route', { skip: !optedIn }, async (t) => {
  let uid;
  t.after(async () => {
    if (!uid) return;
    const cleanup = await Promise.allSettled([
      adminDb.collection('users').doc(uid).delete(),
      adminAuth.deleteUser(uid),
    ]);
    const failures = cleanup.flatMap((result, index) => result.status === 'rejected'
      ? [`${index === 0 ? `users/${uid}` : `Auth user ${uid}`}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : []);
    if (failures.length) throw new AggregateError(failures.map((message) => new Error(message)), failures.join('; '));
  });

  const email = `casaio-emulator-${Date.now()}@example.invalid`;
  const password = 'Synthetic-local-test-password-42';
  let signupResponse;
  try {
    signupResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });
  } catch {
    return t.skip('Local Auth Emulator is not responding at 127.0.0.1:9099.');
  }

  assert.equal(signupResponse.ok, true, `Auth Emulator signup returned HTTP ${signupResponse.status}.`);
  const signup = await signupResponse.json();
  uid = signup.localId;
  assert.equal(typeof signup.idToken, 'string');
  assert.equal(typeof uid, 'string');

  const verificationEmailResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: signup.idToken }),
  });
  assert.equal(verificationEmailResponse.ok, true, `Auth Emulator verification request returned HTTP ${verificationEmailResponse.status}.`);
  await verificationEmailResponse.json();

  const oobCodesResponse = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(oobCodesResponse.ok, true, `Auth Emulator OOB-code lookup returned HTTP ${oobCodesResponse.status}.`);
  const oobCodes = await oobCodesResponse.json();
  const verificationCode = oobCodes.oobCodes?.find((entry) => entry.email === email && entry.requestType === 'VERIFY_EMAIL')?.oobCode;
  assert.equal(typeof verificationCode, 'string');

  const verificationResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oobCode: verificationCode }),
  });
  assert.equal(verificationResponse.ok, true, `Auth Emulator verification update returned HTTP ${verificationResponse.status}.`);
  await verificationResponse.json();

  const signInResponse = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(signInResponse.ok, true, `Auth Emulator sign-in returned HTTP ${signInResponse.status}.`);
  const signedInUser = await signInResponse.json();
  assert.equal(typeof signedInUser.idToken, 'string');

  const response = await POST({ json: async () => ({ idToken: signedInUser.idToken }) });
  const body = await response.json();

  const safeFailure = response.status === 403 && body.code === 'auth/email-not-verified'
    ? 'email verification was not reflected in the fresh token'
    : 'route error details redacted';
  assert.equal(response.status, 200, `Session route returned HTTP ${response.status}; ${safeFailure}.`);
  assert.equal(body.success, true);
  assert.equal(body.user.uid, uid);
  assert.equal(body.user.role, 'customer');
  assert.equal(response.cookies.get('casaio_session')?.httpOnly, true);
  assert.equal((await adminDb.collection('users').doc(uid).get()).exists, true);
});
