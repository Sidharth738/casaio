import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SellerProductUpdateSchema } from './product.ts';

test('accepts the fields used by seller product editing and inventory updates', () => {
  const result = SellerProductUpdateSchema.safeParse({
    title: 'Updated artisan vase',
    slug: 'updated-artisan-vase',
    description: 'A hand-finished vase with a durable glaze.',
    shortDescription: 'Hand-finished ceramic',
    price: 125,
    compareAtPrice: 150,
    costPerItem: 65,
    sku: 'VASE-01',
    stock: 7,
    lowStockThreshold: 2,
    categoryId: 'ceramics',
    categorySlug: 'ceramics',
    tags: ['ceramic', 'handmade'],
    images: [{ url: 'https://example.test/vase.jpg', path: 'products/vase.jpg', isPrimary: true }],
    status: 'active',
  });

  assert.equal(result.success, true);
});

for (const field of [
  'id',
  'sellerId',
  'sellerStoreName',
  'ratings',
  'rating',
  'reviewCount',
  'salesCount',
  'isFeatured',
  'createdAt',
  'updatedAt',
  'barcode',
  'hasVariants',
  'variants',
  'approvalStatus',
]) {
  test(`rejects seller changes to protected or unsupported field ${field}`, () => {
    assert.equal(SellerProductUpdateSchema.safeParse({ [field]: 'unauthorized' }).success, false);
  });
}

test('rejects product statuses outside the defined product status enum', () => {
  assert.equal(SellerProductUpdateSchema.safeParse({ status: 'approved' }).success, false);
});
