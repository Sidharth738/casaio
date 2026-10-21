import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCouponCode, validateCouponDefinition } from './definition.mjs';

const valid = (overrides = {}) => ({
  code: ' save10 ', description: 'Save ten', discountType: 'percentage', discountValue: 10,
  minOrderValue: 0, validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2026-12-31T23:59:59.000Z',
  usageLimit: 100, perUserLimit: 1, isActive: true, usageCount: 900, ...overrides,
});

test('coupon code normalization trims and uppercases without changing other characters', () => {
  assert.equal(normalizeCouponCode('  welcome-500 '), 'WELCOME-500');
});

test('valid terms are normalized and client accounting fields are not included', () => {
  const result = validateCouponDefinition(valid());
  assert.equal(result.ok, true);
  assert.equal(result.definition.code, 'SAVE10');
  assert.equal('usageCount' in result.definition, false);
  assert.equal('isActive' in result.definition, false);
});

test('rejects malformed coupon definitions and zero limit consistently means disabled', () => {
  for (const update of [
    { code: '' }, { discountType: 'bogus' }, { discountValue: 0 }, { discountValue: 101 },
    { minOrderValue: -1 }, { maxDiscountAmount: 0 }, { validUntil: 'bad-date' },
    { usageLimit: -1 }, { usageLimit: 1.5 }, { perUserLimit: 0 },
  ]) assert.equal(validateCouponDefinition(valid(update)).ok, false, JSON.stringify(update));
  assert.equal(validateCouponDefinition(valid({ usageLimit: 0 })).definition.usageLimit, 0);
});

test('maximum discount is optional when absent and must be a positive finite amount when present', () => {
  const withoutCap = validateCouponDefinition(valid({ maxDiscountAmount: undefined }));
  assert.equal(withoutCap.ok, true);
  assert.equal('maxDiscountAmount' in withoutCap.definition, false);
  assert.equal(validateCouponDefinition(valid({ maxDiscountAmount: 0 })).ok, false);
  assert.equal(validateCouponDefinition(valid({ maxDiscountAmount: -1 })).ok, false);
  const positiveCap = validateCouponDefinition(valid({ maxDiscountAmount: 250 }));
  assert.equal(positiveCap.ok, true);
  assert.equal(positiveCap.definition.maxDiscountAmount, 250);
});
