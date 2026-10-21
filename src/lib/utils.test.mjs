import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency } from './utils.js';

test('formatCurrency preserves paise so checkout totals are shown exactly', () => {
  assert.equal(formatCurrency(1180.01), '₹1,180.01');
  assert.equal(formatCurrency(1180), '₹1,180');
});
