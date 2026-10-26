import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyPaymentAttemptRefresh,
  resolveInactiveAttemptRefresh,
} from './payment-attempt-refresh.ts';

test('successful inactive status is distinguished from a failed refresh', () => {
  assert.deepEqual(classifyPaymentAttemptRefresh(true, 200, { active: false }), { kind: 'inactive' });
  assert.deepEqual(classifyPaymentAttemptRefresh(false, 503, { active: false }), {
    kind: 'unavailable',
    httpStatus: 503,
  });
});

test('captured payment always routes through persisted order recovery', () => {
  assert.deepEqual(classifyPaymentAttemptRefresh(true, 200, {
    active: true,
    status: 'captured',
    orderId: 'synthetic-order',
  }), { kind: 'captured', orderId: 'synthetic-order' });
});

test('unresolved attempts remain active and cannot be retried unless the API allows it', () => {
  assert.deepEqual(classifyPaymentAttemptRefresh(true, 200, {
    active: true,
    status: 'unknown',
    retryAvailable: false,
  }), {
    kind: 'active',
    attempt: { orderId: '', status: 'unknown', retryAvailable: false },
  });
});

test('inactive result preserves the guard if a previously known order cannot be checked', () => {
  assert.equal(resolveInactiveAttemptRefresh(undefined, null), 'inactive');
  assert.equal(resolveInactiveAttemptRefresh('synthetic-order', 'confirmed'), 'recovered');
  assert.equal(resolveInactiveAttemptRefresh('synthetic-order', null), 'unavailable');
});
