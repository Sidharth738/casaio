import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRazorpayConfiguration,
  resolveRazorpayWebhookSecret,
} from './razorpay-config-core.ts';

const testEnvironment = (overrides = {}) => ({
  NODE_ENV: 'development',
  RAZORPAY_MODE: 'test',
  RAZORPAY_LIVE_PAYMENTS_ENABLED: 'false',
  RAZORPAY_KEY_ID: 'rzp_test_unit_key_123',
  RAZORPAY_KEY_SECRET: 'unit-test-key-secret',
  RAZORPAY_KEY_SECRET_MODE: 'test',
  RAZORPAY_WEBHOOK_SECRET: 'unit-test-webhook-secret',
  RAZORPAY_WEBHOOK_SECRET_MODE: 'test',
  ...overrides,
});

function assertConfigCode(callback, code) {
  assert.throws(callback, (error) => error.code === code);
}

test('accepts test credentials in development', () => {
  assert.deepEqual(resolveRazorpayConfiguration(testEnvironment()), {
    mode: 'test',
    keyId: 'rzp_test_unit_key_123',
    keySecret: 'unit-test-key-secret',
  });
});

test('rejects live credentials in development and automated tests', () => {
  for (const nodeEnv of ['development', 'test']) {
    assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({
      NODE_ENV: nodeEnv,
      RAZORPAY_MODE: 'live',
      RAZORPAY_KEY_ID: 'rzp_live_unit_key_123',
      RAZORPAY_KEY_SECRET: 'unit-live-key-secret',
      RAZORPAY_KEY_SECRET_MODE: 'live',
    })), 'live_not_authorized');
  }
});

test('accepts live credentials only with the production opt-in', () => {
  const env = testEnvironment({
    NODE_ENV: 'production',
    RAZORPAY_MODE: 'live',
    RAZORPAY_LIVE_PAYMENTS_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'rzp_live_unit_key_123',
    RAZORPAY_KEY_SECRET: 'unit-live-key-secret',
    RAZORPAY_KEY_SECRET_MODE: 'live',
  });
  assert.equal(resolveRazorpayConfiguration(env).mode, 'live');
  assertConfigCode(() => resolveRazorpayConfiguration({
    ...env,
    RAZORPAY_LIVE_PAYMENTS_ENABLED: 'false',
  }), 'live_not_authorized');
});

test('rejects test key IDs paired with live secret mode and live key IDs paired with test secret mode', () => {
  assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({
    RAZORPAY_KEY_SECRET_MODE: 'live',
  })), 'credential_mode_mismatch');

  assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({
    NODE_ENV: 'production',
    RAZORPAY_MODE: 'live',
    RAZORPAY_LIVE_PAYMENTS_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'rzp_live_unit_key_123',
    RAZORPAY_KEY_SECRET_MODE: 'test',
  })), 'credential_mode_mismatch');
});

test('rejects missing key ID, key secret, and webhook secret', () => {
  assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({ RAZORPAY_KEY_ID: '' })), 'missing_credentials');
  assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({ RAZORPAY_KEY_SECRET: '' })), 'missing_credentials');
  assertConfigCode(() => resolveRazorpayWebhookSecret(testEnvironment({ RAZORPAY_WEBHOOK_SECRET: '' })), 'webhook_configuration_invalid');
});

test('rejects invalid or ambiguous modes', () => {
  for (const mode of ['', 'live,test', 'production', 'LIVE']) {
    assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({ RAZORPAY_MODE: mode })), 'invalid_mode');
  }
  assertConfigCode(() => resolveRazorpayConfiguration(testEnvironment({
    RAZORPAY_LIVE_PAYMENTS_ENABLED: 'true',
  })), 'ambiguous_live_configuration');
});

test('does not use client-controlled mode fields', () => {
  const env = { ...testEnvironment(), clientMode: 'live', paymentMode: 'live' };
  assert.equal(resolveRazorpayConfiguration(env).mode, 'test');
});

test('allows simulation only when explicitly enabled outside production and without credentials', () => {
  assert.deepEqual(resolveRazorpayConfiguration({
    NODE_ENV: 'development',
    RAZORPAY_MODE: 'simulation',
    RAZORPAY_SIMULATION_ENABLED: 'true',
  }), { mode: 'simulation' });

  assertConfigCode(() => resolveRazorpayConfiguration({
    NODE_ENV: 'production',
    RAZORPAY_MODE: 'simulation',
    RAZORPAY_SIMULATION_ENABLED: 'true',
  }), 'simulation_not_authorized');
  assertConfigCode(() => resolveRazorpayConfiguration({
    NODE_ENV: 'development',
    RAZORPAY_MODE: 'simulation',
    RAZORPAY_SIMULATION_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'rzp_live_unit_key_123',
  }), 'simulation_not_authorized');
});

test('requires a mode-matched webhook secret', () => {
  const config = resolveRazorpayWebhookSecret(testEnvironment());
  assert.deepEqual(config, { mode: 'test', secret: 'unit-test-webhook-secret' });
  assertConfigCode(() => resolveRazorpayWebhookSecret(testEnvironment({
    RAZORPAY_WEBHOOK_SECRET_MODE: 'live',
  })), 'webhook_configuration_invalid');
});
