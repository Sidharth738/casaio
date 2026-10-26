import test from 'node:test';
import assert from 'node:assert/strict';
import { getRefundDisplay } from '@/lib/orders/refund-display';

test('refund pending is presented independently from an order that remains active', () => {
  const display = getRefundDisplay('refund_pending', 'rfnd_test_pending');
  assert.equal(display.label, 'Refund processing');
  assert.equal(display.tone, 'warning');
  assert.match(display.notice, /bank or payment method/);
  assert.equal(display.reference, 'rfnd_test_pending');
});

test('a processed refund has a verified reference and avoids a fixed arrival promise', () => {
  const display = getRefundDisplay('refunded', 'rfnd_test_processed');
  assert.equal(display.label, 'Refund processed');
  assert.equal(display.tone, 'success');
  assert.match(display.notice, /times vary/);
  assert.equal(display.reference, 'rfnd_test_processed');
});

test('refund failure is not presented as cancellation or payment success', () => {
  const display = getRefundDisplay('refund_failed', 'rfnd_test_failed');
  assert.equal(display.label, 'Refund failed');
  assert.equal(display.tone, 'error');
  assert.match(display.notice, /contact support/);
  assert.equal(display.reference, 'rfnd_test_failed');
});

test('non-refund statuses do not expose refund references', () => {
  assert.deepEqual(getRefundDisplay('pending', 'rfnd_unrelated'), {
    label: 'Pending', tone: 'neutral',
  });
  assert.deepEqual(getRefundDisplay('captured'), { label: 'Captured', tone: 'success' });
});
