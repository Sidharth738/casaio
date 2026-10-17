import assert from 'node:assert/strict';
import test from 'node:test';
import { getActionErrorMessage, validateNewPassword } from './action-code.ts';

test('expired, invalid, and used action links get a safe recovery message', () => {
  for (const code of ['auth/expired-action-code', 'auth/invalid-action-code']) {
    assert.match(getActionErrorMessage({ code }), /expired, is invalid, or has already been used/);
  }
});

test('action errors never include sensitive Firebase error details', () => {
  assert.equal(getActionErrorMessage({ code: 'auth/network-request-failed', message: 'private detail' }), 'We could not reach Casaio securely. Check your connection and try again.');
  assert.doesNotMatch(getActionErrorMessage({ code: 'auth/internal-error', message: 'oobCode=secret' }), /secret|oobCode/);
});

test('password reset uses the existing six-character policy and requires a match', () => {
  assert.equal(validateNewPassword('12345', '12345'), 'Your password must be at least 6 characters long.');
  assert.equal(validateNewPassword('123456', '654321'), 'Your passwords do not match.');
  assert.equal(validateNewPassword('strong-pass', 'strong-pass'), null);
});
