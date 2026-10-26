import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCartOperation,
  GUEST_CART_STORAGE_KEY,
  getCartOwnerKey,
  resolveAuthenticatedCart,
} from './cart-state.ts';
import { calculateItemsSubtotal } from '../orders/money.ts';
import { calculateAuthoritativePricing } from '../orders/checkout-validation.ts';

const item = (overrides = {}) => ({
  productId: 'lamp-1',
  title: 'Ceramic Lamp',
  slug: 'ceramic-lamp',
  imageUrl: '/lamp.jpg',
  unitPrice: 500,
  quantity: 1,
  sellerId: 'seller-1',
  sellerStoreName: 'Atelier',
  maxStock: 10,
  ...overrides,
});

const guest = { migrationId: 'guest-migration-1', items: [item({ quantity: 2 })] };

test('repeated hydration with matching local and Firestore carts does not add quantities repeatedly', () => {
  const first = resolveAuthenticatedCart({ items: [item({ quantity: 2 })] }, guest);
  assert.equal(first.items[0].quantity, 4);

  const persisted = {
    items: first.items,
    guestCartMigrationId: first.guestCartMigrationId,
  };
  assert.equal(resolveAuthenticatedCart(persisted, guest).items[0].quantity, 4);
  assert.equal(resolveAuthenticatedCart(persisted, guest).items[0].quantity, 4);
});

test('local-storage-first and Firestore-first loading both resolve to the same canonical merge', async () => {
  const loadGuest = () => Promise.resolve(guest);
  const loadFirestore = () => Promise.resolve({ items: [item({ quantity: 3 })] });

  const localFirst = await Promise.all([loadGuest(), loadFirestore()]);
  const firestoreFirst = await Promise.all([
    new Promise((resolve) => setTimeout(() => resolve(guest), 0)),
    Promise.resolve({ items: [item({ quantity: 3 })] }),
  ]);

  const resolveLoaded = ([guestCart, remoteCart]) => resolveAuthenticatedCart(remoteCart, guestCart);
  assert.deepEqual(resolveLoaded(localFirst).items, resolveLoaded(firestoreFirst).items);
  assert.equal(resolveLoaded(localFirst).items[0].quantity, 5);
});

test('repeated checkout refreshes and hydration effect reruns keep quantity and totals stable', () => {
  const initial = resolveAuthenticatedCart({ items: [item({ quantity: 2 })] }, guest);
  let persisted = { items: initial.items, guestCartMigrationId: initial.guestCartMigrationId };

  for (let refresh = 0; refresh < 5; refresh += 1) {
    const next = resolveAuthenticatedCart(persisted, guest);
    persisted = { items: next.items, guestCartMigrationId: next.guestCartMigrationId };
  }

  assert.equal(persisted.items[0].quantity, 4);
  assert.equal(calculateItemsSubtotal(persisted.items), 2000);
  const totals = calculateAuthoritativePricing(calculateItemsSubtotal(persisted.items), {
    code: 'SAVE100',
    discountType: 'flat',
    discountValue: 100,
    isActive: true,
  });
  assert.equal(totals.pricing.subtotal, 2000);
  assert.equal(totals.pricing.discountAmount, 100);
  assert.equal(totals.pricing.totalAmount, 1900);
});

test('guest cart migrates once and is marked on the authenticated document', () => {
  const migration = resolveAuthenticatedCart({ items: [] }, guest);
  assert.equal(migration.shouldMigrateGuestCart, true);
  assert.equal(migration.guestCartMigrationId, guest.migrationId);
  assert.equal(migration.items[0].quantity, 2);

  const repeated = resolveAuthenticatedCart({
    items: migration.items,
    guestCartMigrationId: migration.guestCartMigrationId,
  }, guest);
  assert.equal(repeated.shouldMigrateGuestCart, false);
  assert.equal(repeated.items[0].quantity, 2);
});

test('account switching keeps authenticated owners distinct and guest storage separate', () => {
  assert.notEqual(getCartOwnerKey('customer-a'), getCartOwnerKey('customer-b'));
  assert.notEqual(getCartOwnerKey('customer-a'), getCartOwnerKey(null));
  assert.equal(GUEST_CART_STORAGE_KEY, 'casaio_guest_cart_v2');
  assert.equal(GUEST_CART_STORAGE_KEY.includes('customer-a'), false);
  assert.equal(GUEST_CART_STORAGE_KEY.includes('customer-b'), false);
});

test('a second explicit Add to Cart action increments quantity once', () => {
  const firstAdd = applyCartOperation([], { type: 'add', item: item(), quantity: 1 });
  const secondAdd = applyCartOperation(firstAdd, { type: 'add', item: item(), quantity: 1 });
  assert.equal(secondAdd[0].quantity, 2);
  assert.equal(calculateItemsSubtotal(secondAdd), 1000);
});

test('cart quantity and checkout totals stay stable through hydration while preserving explicit adds', () => {
  const cart = [item({ quantity: 2 })];
  const hydrated = resolveAuthenticatedCart({ items: cart }, null).items;
  assert.equal(hydrated[0].quantity, 2);
  assert.equal(calculateItemsSubtotal(hydrated), 1000);

  const added = applyCartOperation(hydrated, { type: 'add', item: item(), quantity: 1 });
  const pricing = calculateAuthoritativePricing(calculateItemsSubtotal(added));
  assert.equal(added[0].quantity, 3);
  assert.equal(pricing.pricing.subtotal, 1500);
  assert.equal(pricing.pricing.totalAmount, 1500);
});

test('cart operations preserve stock limits and existing unspecified-variant behavior', () => {
  const variants = [
    item({ variantSku: 'black', quantity: 1 }),
    item({ variantSku: 'white', quantity: 1 }),
  ];
  const updated = applyCartOperation(variants, {
    type: 'set-quantity',
    productId: 'lamp-1',
    quantity: 3,
  });
  assert.deepEqual(updated.map((entry) => entry.quantity), [3, 3]);
  assert.deepEqual(applyCartOperation(updated, { type: 'remove', productId: 'lamp-1' }), []);

  const capped = applyCartOperation([item({ quantity: 9 })], {
    type: 'add',
    item: item(),
    quantity: 5,
  });
  assert.equal(capped[0].quantity, 10);
});
