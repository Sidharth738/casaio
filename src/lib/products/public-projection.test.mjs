import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPublicProduct } from './public-projection.ts';

test('public product projection omits private seller cost data', () => {
  const result = toPublicProduct({
    id: 'product-one',
    title: 'Public product',
    price: 100,
    costPerItem: 40,
  });

  assert.equal(result.id, 'product-one');
  assert.equal(result.price, 100);
  assert.equal('costPerItem' in result, false);
});
