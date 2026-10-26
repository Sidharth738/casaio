import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const PROJECT_ID = 'demo-casaio-rules';
const APP_ORIGIN = 'http://127.0.0.1:3010';
const AUTH_ORIGIN = 'http://127.0.0.1:9099';
const FIRESTORE_ORIGIN = 'http://127.0.0.1:18080';
const STORAGE_ORIGIN = 'http://127.0.0.1:9199';
const IDENTITY_API = `${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1`;
const FIRESTORE_API = `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DEMO_API_KEY = 'demo-api-key';
const allowedOrigins = new Set([
  APP_ORIGIN,
  'ws://127.0.0.1:3010',
  AUTH_ORIGIN,
  FIRESTORE_ORIGIN,
  'ws://127.0.0.1:19150',
  STORAGE_ORIGIN,
]);
const ownedFirestorePaths = new Set();
const createdAccounts = [];

let fixture;

function assertEmulatorEnvironment() {
  const expected = {
    NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
    FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    GCLOUD_PROJECT: PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(process.env[name], value, `test process must use the explicit local setting for ${name}`);
  }
  for (const name of [
    'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_CONFIG', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
    'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_KEY_ID', 'RAZORPAY_LIVE_KEY_SECRET',
    'RAZORPAY_LIVE_WEBHOOK_SECRET',
  ]) {
    assert.equal(process.env[name], '', `test process must clear ${name}`);
  }
}

async function emulatorJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Local emulator request failed with HTTP ${response.status}.`);
  return body;
}

async function createSyntheticAccount(role, suffix) {
  const account = {
    email: `refund-browser-${suffix}-${role}@example.test`,
    password: `CasaioLocal-${randomUUID()}-A9!`,
    uid: undefined,
    idToken: undefined,
  };
  createdAccounts.push(account);

  const signup = await emulatorJson(`${IDENTITY_API}/accounts:signUp?key=${DEMO_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  account.uid = signup.localId;
  account.idToken = signup.idToken;

  await emulatorJson(`${IDENTITY_API}/accounts:sendOobCode?key=${DEMO_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: signup.idToken }),
  });
  const oobCodes = await emulatorJson(`${AUTH_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const verificationCode = oobCodes.oobCodes?.find((entry) =>
    entry.email === account.email && entry.requestType === 'VERIFY_EMAIL',
  )?.oobCode;
  if (typeof verificationCode !== 'string') throw new Error('Auth Emulator did not produce a synthetic verification code.');
  await emulatorJson(`${IDENTITY_API}/accounts:update?key=${DEMO_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: verificationCode }),
  });

  const signedIn = await emulatorJson(`${IDENTITY_API}/accounts:signInWithPassword?key=${DEMO_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  account.idToken = signedIn.idToken;
  return account;
}

function firestoreValue(value) {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])) } };
  }
  throw new Error('Unsupported synthetic Firestore fixture value.');
}

async function writeOwnedDocument(path, value) {
  const response = await fetch(`${FIRESTORE_API}/${path}`, {
    method: 'PATCH',
    // Emulator-only owner token bypasses rules for isolated synthetic fixtures.
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firestoreValue(entry)])) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Local Firestore fixture write failed with HTTP ${response.status}.`);
  ownedFirestorePaths.add(path);
}

async function deleteOwnedDocument(path) {
  const response = await fetch(`${FIRESTORE_API}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Local Firestore fixture cleanup failed with HTTP ${response.status}.`);
  }
}

async function signInThroughBrowser(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  const sessionResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/session' && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In' }).click();
  const response = await sessionResponse;
  expect(response.status()).toBe(200);
}

function monitorBrowser(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text().toLowerCase();
      const status = text.match(/status of (\d{3})/)?.[1];
      const category = /failed to load resource/.test(text)
        ? `resource-http-${status || 'unknown'}`
        : /firebase/.test(text)
          ? 'firebase-client-error'
          : /hydration/.test(text)
            ? 'hydration-error'
            : 'other-console-error';
      diagnostics.consoleErrors.set(category, (diagnostics.consoleErrors.get(category) || 0) + 1);
    }
  });
  page.on('pageerror', () => diagnostics.pageErrors++);
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (!allowedOrigins.has(url.origin)) diagnostics.unexpectedOrigins.add(url.origin);
    else diagnostics.failedLocalRequests++;
  });
  page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || allowedOrigins.has(url.origin)) {
      await route.continue();
      return;
    }
    diagnostics.unexpectedOrigins.add(url.origin);
    await route.abort('blockedbyclient');
  });
}

async function cleanup() {
  const failures = [];
  for (const path of [...ownedFirestorePaths].reverse()) {
    try {
      await deleteOwnedDocument(path);
    } catch {
      failures.push(`Firestore fixture path: ${path}`);
    }
  }
  for (const account of createdAccounts) {
    if (!account.idToken) continue;
    try {
      await emulatorJson(`${IDENTITY_API}/accounts:delete?key=${DEMO_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: account.idToken }),
      });
    } catch {
      failures.push(`Auth fixture account: ${account.uid || 'creation-incomplete'}`);
    }
  }
  if (failures.length) throw new AggregateError(failures.map((path) => new Error(path)), 'Synthetic browser fixture cleanup failed.');
}

test.beforeAll(async () => {
  assertEmulatorEnvironment();
  const suffix = randomUUID().replaceAll('-', '');
  const admin = await createSyntheticAccount('admin', suffix);
  const customer = await createSyntheticAccount('customer', suffix);
  const orderId = `refund_browser_${suffix}`;
  const attemptId = `attempt_${suffix}`;
  const paymentId = `pay_browser_synthetic_${suffix}`;
  const providerRefundId = `rfnd_browser_synthetic_${suffix}`;
  const orderNumber = `QA-${suffix.slice(0, 10)}`;
  const now = new Date().toISOString();
  const amount = 12_500;
  const requestBody = {
    amount,
    speed: 'normal',
    receipt: `cancel_${orderId}`,
    notes: { orderId, reason: 'Customer cancellation' },
  };
  const idempotencyKey = `fixture_secret_${suffix}`;

  await writeOwnedDocument(`users/${admin.uid}`, {
    uid: admin.uid, email: admin.email, displayName: 'Synthetic Refund Admin', role: 'admin', status: 'active',
  });
  await writeOwnedDocument(`users/${customer.uid}`, {
    uid: customer.uid, email: customer.email, displayName: 'Synthetic Refund Customer', role: 'customer', status: 'active',
  });
  await writeOwnedDocument(`orders/${orderId}`, {
    orderNumber,
    customerId: customer.uid,
    orderStatus: 'confirmed',
    cancellationStatus: 'processing',
    payment: {
      method: 'razorpay', status: 'captured', razorpayPaymentId: paymentId,
      razorpayRefundId: providerRefundId, activeRefundAttemptId: attemptId,
      reconciliationRequired: true, reconciliationReason: 'refund_submission_unknown',
    },
    pricing: { totalAmount: amount / 100 },
    items: [],
  });
  await writeOwnedDocument(`orders/${orderId}/refundAttempts/${attemptId}`, {
    id: attemptId,
    orderId,
    customerId: customer.uid,
    paymentId,
    amount,
    currency: 'INR',
    requestBody,
    requestBodyJson: JSON.stringify(requestBody),
    idempotencyKey,
    state: 'submission_unknown',
    createdAt: now,
    updatedAt: now,
    submissionStartedAt: now,
  });
  await writeOwnedDocument(`orders/${orderId}/refundReconciliationAudit/audit_${suffix}`, {
    actorUid: admin.uid,
    orderId,
    attemptId,
    actionId: `prior_action_${suffix}`,
    action: 'provider_state_reconciliation',
    outcome: 'provider_status_unknown',
    diagnosticCategory: 'refund_submission_unknown',
    createdAt: now,
  });
  fixture = { admin, customer, orderId, attemptId, paymentId, providerRefundId, orderNumber, idempotencyKey };
});

test.afterAll(async () => cleanup());

test('Admin Refunds browser flow stays local, redacted, and read-only during reconciliation', async ({ browser, page }) => {
  const diagnostics = { consoleErrors: new Map(), pageErrors: 0, failedLocalRequests: 0, unexpectedOrigins: new Set() };
  monitorBrowser(page, diagnostics);

  const anonymousResponse = await page.request.get('/api/admin/payment-reconciliation?refunds=true');
  expect(anonymousResponse.status()).toBe(403);
  await page.goto('/admin/refunds');
  await expect(page).toHaveURL(/\/login\?redirect=/);

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  monitorBrowser(customerPage, diagnostics);
  await signInThroughBrowser(customerPage, fixture.customer);
  const customerList = await customerPage.request.get('/api/admin/payment-reconciliation?refunds=true');
  const customerDetails = await customerPage.request.get(`/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`);
  expect(customerList.status()).toBe(403);
  expect(customerDetails.status()).toBe(403);
  await customerPage.goto('/admin/refunds');
  await expect(customerPage.getByRole('heading', { name: 'Admin Privilege Required' })).toBeVisible();
  await customerContext.close();

  await signInThroughBrowser(page, fixture.admin);
  await page.goto('/admin/refunds');
  await expect(page.getByRole('heading', { name: 'Refund reconciliation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unresolved refund cases' })).toBeVisible();

  const listResponse = await page.request.get('/api/admin/payment-reconciliation?refunds=true');
  expect(listResponse.status()).toBe(200);
  const listBody = await listResponse.json();
  expect(listBody.refunds.some((row) => row.orderId === fixture.orderId && row.state === 'submission_unknown')).toBe(true);

  const detailsResponse = await page.request.get(`/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`);
  expect(detailsResponse.status()).toBe(200);
  const detailsBody = await detailsResponse.json();
  const serializedDetails = JSON.stringify(detailsBody);
  for (const secretLikeValue of [fixture.paymentId, fixture.providerRefundId, fixture.idempotencyKey, fixture.customer.uid, fixture.customer.email, fixture.admin.uid]) {
    expect(serializedDetails.includes(secretLikeValue)).toBe(false);
  }
  expect(serializedDetails.includes('requestBody')).toBe(false);
  expect(serializedDetails.includes('requestBodyJson')).toBe(false);
  expect(detailsBody.case.attempts[0].state).toBe('submission_unknown');
  expect(detailsBody.case.history[0].outcome).toBe('provider_status_unknown');

  const orderRow = page.getByRole('row').filter({ hasText: fixture.orderNumber });
  await expect(orderRow).toBeVisible();
  await orderRow.getByRole('button', { name: 'Inspect' }).click();
  await expect(page.getByText('Provider status unknown')).toBeVisible();
  await expect(page.getByText('Provider status not verified')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operator and provider history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reconcile provider status' })).toBeVisible();
  const visibleDetails = await page.locator('main').innerText();
  for (const secretLikeValue of [fixture.paymentId, fixture.providerRefundId, fixture.idempotencyKey, fixture.customer.email, fixture.admin.uid]) {
    expect(visibleDetails.includes(secretLikeValue)).toBe(false);
  }

  const interceptedPosts = [];
  let responsePlan = { status: 202, body: { status: 'unknown', message: 'No unique provider refund could be verified.' } };
  let holdFirstResponse = true;
  let releaseFirstResponse;
  let firstRequestSeen;
  const firstIntercepted = new Promise((resolve) => { firstRequestSeen = resolve; });
  const firstResponseGate = new Promise((resolve) => { releaseFirstResponse = resolve; });

  await page.route('**/api/admin/payment-reconciliation', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const headers = route.request().headers();
    const body = JSON.parse(route.request().postData() || '{}');
    interceptedPosts.push({
      orderId: body.orderId,
      attemptId: body.attemptId,
      hasValidActionKey: /^[A-Za-z0-9_-]{16,80}$/.test(headers['idempotency-key'] || ''),
    });
    if (interceptedPosts.length === 1 && holdFirstResponse) {
      firstRequestSeen();
      await firstResponseGate;
      holdFirstResponse = false;
    }
    await route.fulfill({ status: responsePlan.status, contentType: 'application/json', body: JSON.stringify(responsePlan.body) });
  });

  const openConfirmation = async () => {
    await page.getByRole('button', { name: 'Reconcile provider status' }).click();
    await expect(page.getByRole('dialog', { name: 'Check provider status?' })).toBeVisible();
  };

  await openConfirmation();
  const confirmButton = page.getByRole('button', { name: 'Confirm status check' });
  await confirmButton.evaluate((element) => { element.click(); element.click(); });
  await firstIntercepted;
  await expect(page.getByRole('button', { name: 'Reconcile provider status' })).toBeDisabled();
  expect(interceptedPosts.length).toBe(1);
  releaseFirstResponse();
  await expect(page.getByRole('status')).toContainText('Outcome remains unconfirmed');
  expect(interceptedPosts[0]).toEqual({ orderId: fixture.orderId, attemptId: fixture.attemptId, hasValidActionKey: true });

  responsePlan = { status: 409, body: { status: 'unknown', message: 'Provider evidence does not match this attempt.' } };
  await openConfirmation();
  await page.getByRole('button', { name: 'Confirm status check' }).click();
  await expect(page.getByRole('status')).toContainText('Provider evidence mismatch');

  responsePlan = { status: 503, body: { status: 'unknown', message: 'Provider status could not be verified.' } };
  await openConfirmation();
  await page.getByRole('button', { name: 'Confirm status check' }).click();
  await expect(page.getByRole('status')).toContainText('Outcome remains unconfirmed');
  expect(interceptedPosts.length).toBe(3);
  expect(interceptedPosts.every((request) => request.orderId === fixture.orderId && request.attemptId === fixture.attemptId && request.hasValidActionKey)).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Refund reconciliation' })).toBeVisible();
  const refreshedRow = page.getByRole('row').filter({ hasText: fixture.orderNumber });
  await expect(refreshedRow).toBeVisible();
  await refreshedRow.getByRole('button', { name: 'Inspect' }).click();
  await expect(page.getByRole('button', { name: 'Reconcile provider status' })).toBeVisible();
  const refreshedDetails = await page.request.get(`/api/admin/payment-reconciliation?refundOrderId=${fixture.orderId}`);
  const refreshedBody = await refreshedDetails.json();
  expect(refreshedBody.case.attempts[0].state).toBe('submission_unknown');
  expect(refreshedBody.case.payment.reconciliationRequired).toBe(true);

  expect(diagnostics.unexpectedOrigins.size).toBe(0);
  // The two non-2xx responses below are intentionally fulfilled by the local
  // route mock to exercise mismatch and provider-error display.
  expect(Object.fromEntries(diagnostics.consoleErrors)).toEqual({
    'resource-http-409': 1,
    'resource-http-503': 1,
  });
  expect(diagnostics.pageErrors).toBe(0);
  expect(diagnostics.failedLocalRequests).toBe(0);
});
