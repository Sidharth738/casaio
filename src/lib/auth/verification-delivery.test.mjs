import assert from 'node:assert/strict';
import test from 'node:test';
import { getVerificationDeliveryMessage, getVerificationPendingInstructions } from './verification-delivery.ts';

test('emulator verification instructions explain that no email is sent and how to retrieve the local link', () => {
  const message = getVerificationDeliveryMessage('emulator');
  assert.match(message, /does not send email/);
  assert.match(message, /127\.0\.0\.1:9099\/emulator\/v1\/projects\/demo-casaio-rules\/oobCodes/);
  assert.match(message, /matching oobLink/);
  assert.match(message, /Open .* in your browser/);
});

test('production verification copy still describes email delivery', () => {
  assert.match(getVerificationDeliveryMessage('email'), /verification email has been sent/);
  assert.doesNotMatch(getVerificationDeliveryMessage('email'), /Emulator|127\.0\.0\.1/);
});

test('failed verification requests do not claim that an email was sent', () => {
  assert.match(getVerificationDeliveryMessage('failed'), /could not create a verification link/);
  assert.doesNotMatch(getVerificationDeliveryMessage('failed'), /email has been sent/);
});

test('pending login instructions distinguish emulator mode from production email', () => {
  assert.match(getVerificationPendingInstructions(true), /does not send email/);
  assert.match(getVerificationPendingInstructions(false), /Open the verification email/);
});
