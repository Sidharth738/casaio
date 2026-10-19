import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processSellerProductUpdate } from './seller-update.ts';

const current = {
  sellerId: 'seller-one',
  slug: 'old-product',
  categoryId: 'category-one',
  categorySlug: 'decor',
  title: 'Original product',
};

function makeStore({ products = { 'product-one': current }, categories = { 'category-one': { slug: 'decor', isActive: true } } } = {}) {
  const writes = [];
  const store = {
    writes,
    async getProduct(id) { return products[id] ?? null; },
    async getCategory(id) { return categories[id] ?? null; },
    async findProductIdsBySlug(slug) {
      return Object.entries(products).filter(([, product]) => product.slug === slug).map(([id]) => id);
    },
    async updateProduct(id, updates) { writes.push({ id, updates }); },
  };
  return store;
}

const seller = { uid: 'seller-one', role: 'seller' };

test('rejects unauthenticated and non-seller update attempts', async () => {
  const store = makeStore();
  assert.equal((await processSellerProductUpdate(null, 'product-one', { title: 'Updated product' }, store)).status, 403);
  assert.equal((await processSellerProductUpdate({ uid: 'customer-one', role: 'customer' }, 'product-one', { title: 'Updated product' }, store)).status, 403);
  assert.equal(store.writes.length, 0);
});

test('rejects a seller updating another seller product', async () => {
  const store = makeStore({ products: { 'product-one': { ...current, sellerId: 'seller-two' } } });
  const result = await processSellerProductUpdate(seller, 'product-one', { title: 'Updated product' }, store);
  assert.equal(result.status, 403);
  assert.equal(store.writes.length, 0);
});

test('rejects invalid and protected seller fields', async () => {
  const store = makeStore();
  for (const body of [
    { ratings: { average: 5 } },
    { hasVariants: true },
    { stock: -1 },
    { stock: 1.5 },
    { lowStockThreshold: -1 },
    { price: 0 },
    { tags: ['valid', 2] },
    { images: [{ url: 'ftp://example.test/image.jpg', path: 'products/image.jpg', isPrimary: true }] },
  ]) {
    assert.equal((await processSellerProductUpdate(seller, 'product-one', body, store)).status, 400);
  }
  assert.equal(store.writes.length, 0);
});

test('rejects missing and inactive categories', async () => {
  const missing = makeStore();
  assert.equal((await processSellerProductUpdate(seller, 'product-one', { categoryId: 'missing' }, missing)).status, 400);

  const inactive = makeStore({ categories: { 'category-two': { slug: 'home', isActive: false } } });
  assert.equal((await processSellerProductUpdate(seller, 'product-one', { categoryId: 'category-two', categorySlug: 'home' }, inactive)).status, 400);
});

test('rejects a category id and slug mismatch', async () => {
  const store = makeStore({ categories: { 'category-two': { slug: 'home', isActive: true } } });
  const result = await processSellerProductUpdate(seller, 'product-one', { categoryId: 'category-two', categorySlug: 'decor' }, store);
  assert.equal(result.status, 400);
  assert.equal(store.writes.length, 0);
});

test('rejects duplicate slugs but permits the current product slug', async () => {
  const store = makeStore({ products: {
    'product-one': current,
    'product-two': { sellerId: 'seller-two', slug: 'taken-slug' },
  } });
  assert.equal((await processSellerProductUpdate(seller, 'product-one', { slug: 'taken-slug' }, store)).status, 409);
  const sameSlug = await processSellerProductUpdate(seller, 'product-one', { slug: 'old-product' }, store);
  assert.equal(sameSlug.status, 200);
});

test('accepts a legitimate seller edit and stores the canonical category slug', async () => {
  const store = makeStore({ categories: {
    'category-one': { slug: 'decor', isActive: true },
    'category-two': { slug: 'home-goods', isActive: true },
  } });
  const result = await processSellerProductUpdate(seller, 'product-one', {
    title: 'Updated artisan product',
    categoryId: 'category-two',
    categorySlug: 'home-goods',
    price: 125,
    stock: 7,
    images: [{ url: 'https://example.test/product.jpg', path: 'products/product.jpg', isPrimary: true }],
  }, store, '2026-10-19T00:00:00.000Z');
  assert.equal(result.status, 200);
  assert.equal(store.writes[0].updates.categorySlug, 'home-goods');
  assert.equal(store.writes[0].updates.updatedAt, '2026-10-19T00:00:00.000Z');
});

test('inventory restock changes stock without changing a draft status', async () => {
  const draft = { ...current, status: 'draft', stock: 0 };
  const store = makeStore({ products: { 'product-one': draft } });
  const result = await processSellerProductUpdate(seller, 'product-one', { stock: 5 }, store);
  assert.equal(result.status, 200);
  assert.equal(store.writes[0].updates.stock, 5);
  assert.equal(Object.hasOwn(store.writes[0].updates, 'status'), false);
  assert.equal(Object.hasOwn(store.writes[0].updates, 'tags'), false);
  assert.equal(Object.hasOwn(store.writes[0].updates, 'lowStockThreshold'), false);
  assert.equal(draft.status, 'draft');
});

test('rejects product update if sellerStatus is not approved', async () => {
  const store = makeStore({ products: { 'product-one': current } });
  const pendingSeller = { uid: 'seller-one', role: 'seller', sellerStatus: 'pending' };
  const suspendedSeller = { uid: 'seller-one', role: 'seller', sellerStatus: 'suspended' };

  const pendingResult = await processSellerProductUpdate(pendingSeller, 'product-one', { stock: 5 }, store);
  assert.equal(pendingResult.status, 403);
  assert.match(pendingResult.body.error, /approved seller profile is required/);

  const suspendedResult = await processSellerProductUpdate(suspendedSeller, 'product-one', { stock: 5 }, store);
  assert.equal(suspendedResult.status, 403);
  assert.match(suspendedResult.body.error, /approved seller profile is required/);
  assert.equal(store.writes.length, 0);
});
