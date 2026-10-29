import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeProductionRateLimit, consumeRateLimit } from './rate-limit.ts';

test('rate limiter rejects requests after the configured quota', () => {
  const first = consumeRateLimit('test-key', 2, 1000, 1000);
  const second = consumeRateLimit('test-key', 2, 1000, 1001);
  const third = consumeRateLimit('test-key', 2, 1000, 1002);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 1);
});

test('rate limiter resets after the window', () => {
  const result = consumeRateLimit('reset-key', 1, 1000, 2000);
  assert.equal(result.allowed, true);
  assert.equal(consumeRateLimit('reset-key', 1, 1000, 2999).allowed, false);
  assert.equal(consumeRateLimit('reset-key', 1, 1000, 3000).allowed, true);
});

test('production limiter fails closed when distributed configuration is missing', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRequired = process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;
  process.env.NODE_ENV = 'production';
  delete process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;
  try {
    const result = await consumeProductionRateLimit('missing-provider', 1, 60);
    assert.equal(result.available, false);
    assert.equal(result.allowed, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRequired === undefined) delete process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;
    else process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT = previousRequired;
  }
});

test('production limiter accepts a valid Lua result and enforces the returned count', async () => {
  const previous = { node: process.env.NODE_ENV, url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  process.env.NODE_ENV = 'production';
  process.env.UPSTASH_REDIS_REST_URL = 'https://rate-limit.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.match(init.body, /INCR/);
    assert.match(init.body, /EXPIRE/);
    return new Response(JSON.stringify({ result: [2, 59] }), { status: 200 });
  };
  try {
    const result = await consumeProductionRateLimit('valid-result', 2, 60);
    assert.deepEqual(result, { allowed: true, retryAfterSeconds: 60, available: true });
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
    if (previous.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = previous.url;
    if (previous.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
  }
});

test('production limiter fails closed for malformed, expired, and provider-error responses', async () => {
  const previous = { node: process.env.NODE_ENV, url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  process.env.NODE_ENV = 'production';
  process.env.UPSTASH_REDIS_REST_URL = 'https://rate-limit.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const originalFetch = globalThis.fetch;
  for (const response of [
    new Response('{"result":["not-a-count",59]}', { status: 200 }),
    new Response('{"result":[1,0]}', { status: 200 }),
    new Response('{"error":"script failed"}', { status: 200 }),
    new Response('upstream failure', { status: 503 }),
  ]) {
    globalThis.fetch = async () => response.clone();
    const result = await consumeProductionRateLimit('invalid-result', 2, 60);
    assert.equal(result.available, false);
    assert.equal(result.allowed, false);
  }
  globalThis.fetch = async () => { throw new Error('timeout'); };
  try {
    const result = await consumeProductionRateLimit('timeout-result', 2, 60);
    assert.equal(result.available, false);
    assert.equal(result.allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
    if (previous.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = previous.url;
    if (previous.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
  }
});
