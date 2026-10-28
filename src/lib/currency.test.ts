import assert from 'node:assert/strict';
import test from 'node:test';
import { formatConvertedCurrency, getRegion } from './currency';

test('resolves supported regions and currencies', () => {
  assert.equal(getRegion('US').currency, 'USD');
  assert.equal(getRegion('missing').currency, 'INR');
});

test('converts an INR base amount using the supplied rate', () => {
  assert.equal(formatConvertedCurrency(1000, 'USD', 0.01, 'en-US'), '$10.00');
  assert.equal(formatConvertedCurrency(1000, 'INR', 1, 'en-IN'), '₹1,000');
});
