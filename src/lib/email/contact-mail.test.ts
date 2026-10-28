import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail } from './contact-mail';

test('accepts normal customer email addresses', () => {
  assert.equal(isValidEmail('customer@example.com'), true);
});

test('rejects malformed and header-injection email values', () => {
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('customer@example.com\r\nBcc: attacker@example.com'), false);
});
