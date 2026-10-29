import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Module from 'node:module';
import { resolve } from 'node:path';

Object.assign(process.env, {
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-casaio-rules',
});

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') return resolve(process.cwd(), 'node_modules/next/dist/compiled/server-only/empty.js');
  return originalResolveFilename.call(this, request, ...args);
};
const { adminAuth, adminDb } = await import('@/lib/firebase/admin');
const { GET: mediaGet } = await import('@/app/api/telegram/media/route');
const { POST: uploadPost } = await import('@/app/api/telegram/upload/route');
const { POST: contactPost } = await import('@/app/api/contact/route');
Module._resolveFilename = originalResolveFilename;

let currentUser;
let products;
let fetchCalls;

function mediaRequest(fileId, session = 'session') {
  return {
    nextUrl: { searchParams: new URLSearchParams(fileId ? { fileId } : {}) },
    cookies: { get: (name) => name === 'casaio_session' && session ? { value: session } : undefined },
  };
}

function routeRequest(body, headers = {}) {
  return new Request('http://example.test/api', { method: 'POST', headers, body });
}

beforeEach(() => {
  mock.restoreAll();
  currentUser = null;
  products = [
    { sellerId: 'seller-one', status: 'draft', images: [{ path: 'linked-seller-media' }] },
    { sellerId: 'seller-two', status: 'active', images: [{ path: 'linked-other-media' }] },
  ];
  fetchCalls = [];
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';
  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: currentUser?.uid || 'unknown', email: 'test@example.invalid' }));
  mock.method(adminDb, 'collection', (name) => ({
    doc: (id) => ({ get: async () => ({ exists: Boolean(currentUser), data: () => currentUser }) }),
    where: () => ({ get: async () => ({ docs: products.filter((product) => !currentUser || currentUser.role === 'admin' || product.sellerId === currentUser.uid).map((data) => ({ data: () => data })) }) }),
    get: async () => ({ docs: products.map((data) => ({ data: () => data })) }),
  }));
  mock.method(globalThis, 'fetch', async (...args) => {
    fetchCalls.push(args);
    return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/test.jpg' } }), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  });
});

afterEach(() => mock.restoreAll());

test('Telegram media rejects anonymous, cross-seller, arbitrary, and malformed access', async () => {
  assert.equal((await mediaGet(mediaRequest('linked-seller-media', null))).status, 404);
  currentUser = { uid: 'seller-two', role: 'seller', status: 'active' };
  assert.equal((await mediaGet(mediaRequest('linked-seller-media'))).status, 404);
  assert.equal((await mediaGet(mediaRequest('unlinked-id'))).status, 404);
  assert.equal((await mediaGet(mediaRequest('../secret'))).status, 404);
  assert.equal(fetchCalls.length, 0);
});

test('Telegram media allows linked seller/admin media with private caching', async () => {
  currentUser = { uid: 'seller-one', role: 'seller', status: 'active' };
  let response = await mediaGet(mediaRequest('linked-seller-media'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');

  currentUser = { uid: 'admin-one', role: 'admin', status: 'active' };
  response = await mediaGet(mediaRequest('linked-other-media'));
  assert.equal(response.status, 200);
  assert.equal((await mediaGet(mediaRequest('arbitrary-id'))).status, 404);
});

test('upload and contact reject requests before outbound side effects', async () => {
  currentUser = null;
  assert.equal((await uploadPost(routeRequest(new Uint8Array(), { 'content-type': 'multipart/form-data; boundary=bad' }))).status, 403);
  assert.equal((await contactPost(routeRequest('{"email":"bad"}', { 'content-type': 'text/plain' }))).status, 415);
  assert.equal(fetchCalls.length, 0);
});
