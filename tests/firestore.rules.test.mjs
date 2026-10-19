import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = 'demo-casaio-rules';
const customerId = 'customer-one';
const strangerId = 'customer-two';
const sellerId = 'seller-one';
const otherSellerId = 'seller-two';
const adminId = 'admin-one';
const productId = 'seller-product-one';

let testEnv;

function userProfile(uid, role = 'customer') {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    role,
    status: 'active',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  };
}

function validNewCustomerProfile(uid) {
  return {
    ...userProfile(uid),
    photoURL: null,
  };
}

function asUser(uid, emailVerified = true) {
  return testEnv.authenticatedContext(uid, { email_verified: emailVerified }).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', customerId), userProfile(customerId)),
      setDoc(doc(db, 'users', strangerId), userProfile(strangerId)),
      setDoc(doc(db, 'users', sellerId), userProfile(sellerId, 'seller')),
      setDoc(doc(db, 'users', otherSellerId), userProfile(otherSellerId, 'seller')),
      setDoc(doc(db, 'users', adminId), userProfile(adminId, 'admin')),
      setDoc(doc(db, 'sellers', sellerId), {
        id: sellerId,
        status: 'approved',
        storeName: 'Test Store',
        payoutDetails: {
          accountHolderName: 'Private Test Owner',
          accountNumber: '1234567890',
          ifscCode: 'TEST0001234',
          upiId: 'private@example.test',
        },
        commissionRatePercent: 10,
        metrics: { totalSalesAmount: 2000, totalOrdersCount: 3 },
      }),
      setDoc(doc(db, 'orders', 'order-one'), {
        customerId,
        sellerIds: [sellerId],
        orderNumber: 'TEST-ORDER-1',
      }),
      setDoc(doc(db, 'categories', 'category-one'), {
        name: 'Decor', slug: 'decor', isActive: true,
      }),
      setDoc(doc(db, 'categories', 'category-two'), {
        name: 'Home', slug: 'home', isActive: true,
      }),
      setDoc(doc(db, 'categories', 'category-inactive'), {
        name: 'Inactive', slug: 'inactive', isActive: false,
      }),
      setDoc(doc(db, 'products', productId), {
        id: productId,
        sellerId,
        sellerStoreName: 'Test Store',
        title: 'Test product',
        slug: 'test-product',
        description: 'A valid product description for testing.',
        shortDescription: 'Test product',
        price: 100,
        compareAtPrice: 120,
        sku: 'TEST-1',
        stock: 5,
        lowStockThreshold: 2,
        categoryId: 'category-one',
        categorySlug: 'decor',
        tags: ['test'],
        images: [{ url: 'https://example.test/product.jpg', path: 'products/product.jpg', isPrimary: true }],
        hasVariants: false,
        status: 'active',
        ratings: { average: 4.5, count: 2 },
        salesCount: 9,
        isFeatured: false,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      }),
      setDoc(doc(db, 'productPrivate', productId), { costPerItem: 50 }),
    ]);
  });
});

test('a customer cannot create a profile with role admin', async () => {
  const db = asUser('new-admin-attempt');
  await assertFails(setDoc(
    doc(db, 'users', 'new-admin-attempt'),
    { ...validNewCustomerProfile('new-admin-attempt'), role: 'admin' },
  ));
});

test('a customer cannot create a profile with role seller', async () => {
  const db = asUser('new-seller-attempt');
  await assertFails(setDoc(
    doc(db, 'users', 'new-seller-attempt'),
    { ...validNewCustomerProfile('new-seller-attempt'), role: 'seller' },
  ));
});

test('a customer can create a valid customer profile with string timestamps', async () => {
  const uid = 'new-customer';
  const db = asUser(uid);
  const profile = validNewCustomerProfile(uid);

  assert.equal(typeof profile.createdAt, 'string');
  assert.equal(typeof profile.updatedAt, 'string');
  await assertSucceeds(setDoc(doc(db, 'users', uid), profile));
});

test('a customer cannot update their role or status', async () => {
  const db = asUser(customerId);
  const profileRef = doc(db, 'users', customerId);

  await assertFails(updateDoc(profileRef, { role: 'admin' }));
  await assertFails(updateDoc(profileRef, { status: 'suspended' }));
});

test('a stranger cannot read an approved seller private document', async () => {
  const db = asUser(strangerId);
  await assertFails(getDoc(doc(db, 'sellers', sellerId)));
});

test('the seller owner can read their private seller document', async () => {
  const db = asUser(sellerId);
  const snapshot = await assertSucceeds(getDoc(doc(db, 'sellers', sellerId)));
  assert.equal(snapshot.data().payoutDetails.accountNumber, '1234567890');
});

test('an authorized admin can read a seller private document', async () => {
  const db = asUser(adminId, false);
  const snapshot = await assertSucceeds(getDoc(doc(db, 'sellers', sellerId)));
  assert.equal(snapshot.data().payoutDetails.accountNumber, '1234567890');
});

test('a stranger cannot read an active product or its private cost document', async () => {
  const db = asUser(strangerId);
  await assertFails(getDoc(doc(db, 'products', productId)));
  await assertFails(getDoc(doc(db, 'productPrivate', productId)));
});

test('the product owner and admin can read private product cost', async () => {
  const sellerDb = asUser(sellerId);
  const adminDb = asUser(adminId, false);
  const [sellerCost, adminCost] = await Promise.all([
    assertSucceeds(getDoc(doc(sellerDb, 'productPrivate', productId))),
    assertSucceeds(getDoc(doc(adminDb, 'productPrivate', productId))),
  ]);
  assert.equal(sellerCost.data().costPerItem, 50);
  assert.equal(adminCost.data().costPerItem, 50);
  await assertFails(setDoc(doc(sellerDb, 'productPrivate', productId), { costPerItem: 1 }));
});

test('a seller cannot delete a product directly, and the admin SDK path remains separate', async () => {
  const sellerDb = asUser(sellerId);
  const adminClientDb = asUser(adminId, false);
  await assertFails(deleteDoc(doc(sellerDb, 'products', productId)));
  await assertFails(deleteDoc(doc(adminClientDb, 'products', productId)));
});

test('seller application create rules reject forged status, commission, and metrics', async () => {
  const db = asUser('new-applicant');
  const base = {
    id: 'new-applicant', storeName: 'Applicant Store', storeSlug: 'applicant-store',
    storeEmail: 'applicant@example.test', storePhone: '1234567890', description: 'A seller application',
    businessAddress: { street: 'Main Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' },
    status: 'pending', createdAt: '2026-10-19T00:00:00.000Z', updatedAt: '2026-10-19T00:00:00.000Z',
  };
  for (const extra of [
    { commissionRatePercent: 0 },
    { metrics: { totalSalesAmount: 999999 } },
    { status: 'approved' },
    { payoutDetails: { accountNumber: 'forged' } },
  ]) {
    await assertFails(setDoc(doc(db, 'sellers', 'new-applicant'), { ...base, ...extra }));
  }
});

test('seller direct updates cannot change commission, status, payout, or metrics', async () => {
  const db = asUser(sellerId);
  for (const update of [
    { commissionRatePercent: 0 },
    { metrics: { totalSalesAmount: 999999 } },
    { status: 'approved' },
    { payoutDetails: { accountNumber: 'forged' } },
    { storeName: 'Direct edit bypass' },
  ]) {
    await assertFails(updateDoc(doc(db, 'sellers', sellerId), update));
  }
});

test('clients cannot forge review publication or verified purchase on create', async () => {
  const db = asUser(customerId);
  for (const fields of [
    { status: 'published' },
    { isVerifiedPurchase: true },
    { status: 'published', isVerifiedPurchase: true },
  ]) {
    await assertFails(setDoc(doc(db, 'reviews', `forged-${Object.keys(fields).join('-')}`), {
      productId, userId: customerId, rating: 5, title: 'Forged', comment: 'Forged review', ...fields,
    }));
  }
});

test('clients cannot change or delete reviews, including publication and verified status', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'reviews', 'review-one'), {
      productId, userId: customerId, rating: 4, title: 'Review', comment: 'Review text',
      status: 'published', isVerifiedPurchase: false,
    });
  });
  const ownerDb = asUser(customerId);
  const strangerDb = asUser(strangerId);
  const reviewRef = doc(ownerDb, 'reviews', 'review-one');
  await assertFails(updateDoc(reviewRef, { status: 'published', isVerifiedPurchase: true }));
  await assertFails(updateDoc(reviewRef, { title: 'Changed review' }));
  await assertFails(deleteDoc(reviewRef));
  await assertFails(updateDoc(doc(strangerDb, 'reviews', 'review-one'), { status: 'published' }));
});

test('a customer cannot create an order directly in Firestore', async () => {
  const db = asUser(customerId);
  await assertFails(setDoc(doc(db, 'orders', 'client-created-order'), {
    customerId,
    sellerIds: [sellerId],
  }));
});

test('the order customer can read their order and matching order-history query', async () => {
  const db = asUser(customerId);
  const snapshot = await assertSucceeds(getDoc(doc(db, 'orders', 'order-one')));
  assert.equal(snapshot.data().customerId, customerId);

  const orders = await assertSucceeds(getDocs(query(
    collection(db, 'orders'),
    where('customerId', '==', customerId),
  )));
  assert.equal(orders.size, 1);
});

test('a different customer cannot read another customer order', async () => {
  const db = asUser(strangerId);
  await assertFails(getDoc(doc(db, 'orders', 'order-one')));
});

test('sellers cannot read order documents directly via client SDK (privacy requires server projection)', async () => {
  const db = asUser(sellerId);
  await assertFails(getDoc(doc(db, 'orders', 'order-one')));
  await assertFails(getDocs(query(
    collection(db, 'orders'),
    where('sellerIds', 'array-contains', sellerId),
  )));
});

test('a customer can read their own order document', async () => {
  const db = asUser(customerId);
  const snapshot = await assertSucceeds(getDoc(doc(db, 'orders', 'order-one')));
  assert.equal(snapshot.data().customerId, customerId);
});

test('a seller not listed on the order cannot read it', async () => {
  const db = asUser(otherSellerId);
  await assertFails(getDoc(doc(db, 'orders', 'order-one')));
});

test('an authorized admin can read an order', async () => {
  const db = asUser(adminId, false);
  const snapshot = await assertSucceeds(getDoc(doc(db, 'orders', 'order-one')));
  assert.equal(snapshot.data().customerId, customerId);
});

test('a seller can update inventory directly without changing product status', async () => {
  const db = asUser(sellerId);
  const productRef = doc(db, 'products', productId);

  await assertSucceeds(updateDoc(productRef, {
    stock: 4,
    updatedAt: '2026-10-19T01:00:00.000Z',
  }));
  const snapshot = await getDoc(productRef);
  assert.equal(snapshot.data().stock, 4);
  assert.equal(snapshot.data().status, 'active');
});

test('a seller without an approved status document cannot update product inventory directly', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'sellers', 'seller-pending'), {
      id: 'seller-pending',
      status: 'pending',
    });
    await setDoc(doc(context.firestore(), 'users', 'seller-pending'), userProfile('seller-pending', 'seller'));
    await setDoc(doc(context.firestore(), 'products', 'pending-product'), {
      sellerId: 'seller-pending',
      status: 'active',
      stock: 10,
      updatedAt: '2026-10-19T00:00:00.000Z',
    });
  });

  const db = asUser('seller-pending');
  const productRef = doc(db, 'products', 'pending-product');
  await assertFails(updateDoc(productRef, { stock: 5, updatedAt: '2026-10-19T01:00:00.000Z' }));
});

test('direct seller writes cannot bypass the seller API for product edits', async () => {
  const db = asUser(sellerId);
  const productRef = doc(db, 'products', productId);
  for (const update of [
    { hasVariants: true },
    { slug: 'direct-slug-change' },
    { price: -1 },
    { price: '100' },
    { compareAtPrice: 0 },
    { costPerItem: -5 },
    { stock: 1.5 },
    { stock: -1 },
    { lowStockThreshold: -1 },
    { tags: ['valid', 2] },
    { tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) },
    { images: [{ url: 'javascript:alert(1)', path: 'products/x.jpg', isPrimary: true }] },
    { images: [{ url: 'https://example.test/x.jpg', path: 'products/x.jpg', isPrimary: 'yes' }] },
    { status: 'approved' },
  ]) {
    await assertFails(updateDoc(productRef, { ...update, updatedAt: '2026-10-19T01:00:00.000Z' }));
  }
});

test('seller category changes must go through the validated seller API', async () => {
  const db = asUser(sellerId);
  const productRef = doc(db, 'products', productId);
  await assertFails(updateDoc(productRef, { categoryId: 'missing', categorySlug: 'missing' }));
  await assertFails(updateDoc(productRef, { categoryId: 'category-inactive', categorySlug: 'inactive' }));
  await assertFails(updateDoc(productRef, { categoryId: 'category-two', categorySlug: 'decor' }));
  await assertFails(updateDoc(productRef, { categoryId: 'category-two', categorySlug: 'home' }));
});

test('restocking a draft product can preserve its status', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'products', 'draft-product'), {
      sellerId,
      status: 'draft',
      stock: 0,
      updatedAt: '2026-10-19T00:00:00.000Z',
    });
  });
  const db = asUser(sellerId);
  const draftRef = doc(db, 'products', 'draft-product');
  await assertSucceeds(updateDoc(draftRef, { stock: 4, updatedAt: '2026-10-19T01:00:00.000Z' }));
  assert.equal((await getDoc(draftRef)).data().status, 'draft');
});

test('a seller cannot update product metrics, feature flags, or protected identity fields', async () => {
  const db = asUser(sellerId);
  const productRef = doc(db, 'products', productId);

  for (const update of [
    { ratings: { average: 5, count: 500 } },
    { salesCount: 500 },
    { isFeatured: true },
    { sellerId: otherSellerId },
    { sellerStoreName: 'Impersonated Store' },
    { createdAt: '2030-01-01T00:00:00.000Z' },
    { status: 'approved' },
  ]) {
    await assertFails(updateDoc(productRef, update));
  }
});

test('a seller cannot update another seller product', async () => {
  const db = asUser(otherSellerId);
  await assertFails(updateDoc(doc(db, 'products', productId), { title: 'Tampered title' }));
});

test('a seller cannot bypass product validation by creating a product directly', async () => {
  const db = asUser(sellerId);
  await assertFails(setDoc(doc(db, 'products', 'client-created-product'), {
    sellerId,
    title: 'Unvalidated product',
    ratings: { average: 5, count: 1000 },
    salesCount: 9999,
    isFeatured: true,
  }));
});
