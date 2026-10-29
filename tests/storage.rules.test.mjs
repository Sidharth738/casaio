import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = 'demo-casaio-rules';
const sellerId = 'seller-one';
const otherSellerId = 'seller-two';
const pendingSellerId = 'seller-pending';
const suspendedSellerId = 'seller-suspended';
const missingSellerRecordId = 'seller-no-record';
const malformedUserId = 'seller-no-status';
const malformedSellerId = 'seller-no-status-record';
const adminId = 'admin-one';
const strangerId = 'customer-one';
const productPath = `products/${sellerId}/product-image.jpg`;
const kycPath = `sellers/${sellerId}/kyc/identity.pdf`;

let testEnv;

function profile(uid, role = 'customer', status = 'active') {
  return { uid, email: `${uid}@example.test`, displayName: uid, role, status };
}

function bytes(size) {
  return new Uint8Array(size);
}

function storageFor(uid, emailVerified = true) {
  return testEnv.authenticatedContext(uid, { email_verified: emailVerified }).storage();
}

async function seedUserData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', sellerId), profile(sellerId, 'seller')),
      setDoc(doc(db, 'users', otherSellerId), profile(otherSellerId, 'seller')),
      setDoc(doc(db, 'users', pendingSellerId), profile(pendingSellerId, 'seller')),
      setDoc(doc(db, 'users', suspendedSellerId), profile(suspendedSellerId, 'seller', 'suspended')),
      setDoc(doc(db, 'users', missingSellerRecordId), profile(missingSellerRecordId, 'seller')),
      setDoc(doc(db, 'users', malformedUserId), { uid: malformedUserId, role: 'seller' }),
      setDoc(doc(db, 'users', malformedSellerId), profile(malformedSellerId, 'seller')),
      setDoc(doc(db, 'users', adminId), profile(adminId, 'admin')),
      setDoc(doc(db, 'users', strangerId), profile(strangerId)),
      setDoc(doc(db, 'sellers', sellerId), { status: 'approved' }),
      setDoc(doc(db, 'sellers', otherSellerId), { status: 'approved' }),
      setDoc(doc(db, 'sellers', pendingSellerId), { status: 'pending' }),
      setDoc(doc(db, 'sellers', suspendedSellerId), { status: 'approved' }),
      setDoc(doc(db, 'sellers', malformedUserId), { status: 'approved' }),
      setDoc(doc(db, 'sellers', malformedSellerId), {}),
    ]);
  });
}

before(async () => {
  const storageRules = readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8');
  const firestoreRules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(readFileSync(resolve(process.cwd(), 'firebase.json'), 'utf8'), /"rules"\s*:\s*"storage\.rules"/);
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

after(async () => testEnv?.cleanup());

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedUserData();
});

test('unauthenticated users cannot upload product media, but can read product media publicly', async () => {
  const unauthenticated = testEnv.unauthenticatedContext().storage();
  const product = ref(unauthenticated, productPath);
  await assertFails(uploadBytes(product, bytes(1), { contentType: 'image/jpeg' }));

  await assertSucceeds(uploadBytes(ref(storageFor(sellerId), productPath), bytes(1), { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(product));
});

test('only an approved seller can write its own product media', async () => {
  await assertSucceeds(uploadBytes(ref(storageFor(sellerId), productPath), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(otherSellerId), `products/${sellerId}/other.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(pendingSellerId), `products/${pendingSellerId}/pending.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(suspendedSellerId), `products/${suspendedSellerId}/suspended.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(testEnv.unauthenticatedContext().storage(), `products/${sellerId}/anonymous.jpg`), bytes(1), { contentType: 'image/jpeg' }));
});

test('administrators can upload product media, subject to the same type and size limits', async () => {
  await assertSucceeds(uploadBytes(ref(storageFor(adminId), `products/${sellerId}/admin.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(storageFor(adminId), `products/${sellerId}/admin.mp4`), bytes(1), { contentType: 'video/mp4' }));
  await assertFails(uploadBytes(ref(storageFor(adminId), `products/${sellerId}/admin.exe`), bytes(1), { contentType: 'application/octet-stream' }));
});

test('product image and video limits accept the exact boundary and reject one byte over', async () => {
  await assertSucceeds(uploadBytes(ref(storageFor(sellerId), `products/${sellerId}/image-boundary.jpg`), bytes(10 * 1024 * 1024), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(sellerId), `products/${sellerId}/image-over.jpg`), bytes(10 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(storageFor(sellerId), `products/${sellerId}/video-boundary.mp4`), bytes(50 * 1024 * 1024), { contentType: 'video/mp4' }));
  await assertFails(uploadBytes(ref(storageFor(sellerId), `products/${sellerId}/video-over.mp4`), bytes(50 * 1024 * 1024 + 1), { contentType: 'video/mp4' }));
});

test('product overwrites and deletes require the seller owner or administrator', async () => {
  const ownerRef = ref(storageFor(sellerId), productPath);
  await assertSucceeds(uploadBytes(ownerRef, bytes(1), { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ownerRef, bytes(2), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(otherSellerId), productPath), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(deleteObject(ref(storageFor(otherSellerId), productPath)));
  await assertSucceeds(deleteObject(ref(storageFor(adminId), productPath)));
});

test('KYC documents are private and accept only approved image or PDF types up to 10 MB', async () => {
  const ownerRef = ref(storageFor(sellerId), kycPath);
  await assertSucceeds(uploadBytes(ownerRef, bytes(10 * 1024 * 1024), { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageFor(sellerId), `sellers/${sellerId}/kyc/over.pdf`), bytes(10 * 1024 * 1024 + 1), { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageFor(sellerId), `sellers/${sellerId}/kyc/script.exe`), bytes(1), { contentType: 'application/octet-stream' }));
  await assertSucceeds(getBytes(ownerRef));
  await assertSucceeds(getBytes(ref(storageFor(adminId), kycPath)));
  await assertFails(getBytes(ref(storageFor(strangerId), kycPath)));
  const unauthenticated = testEnv.unauthenticatedContext().storage();
  await assertFails(getBytes(ref(unauthenticated, kycPath)));
  await assertFails(uploadBytes(ref(storageFor(otherSellerId), kycPath), bytes(1), { contentType: 'application/pdf' }));
});

test('missing user records do not bypass ownership checks', async () => {
  await assertFails(uploadBytes(ref(storageFor('missing-user'), 'products/missing-user/image.jpg'), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(missingSellerRecordId), `products/${missingSellerRecordId}/image.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(malformedUserId), `products/${malformedUserId}/image.jpg`), bytes(1), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageFor(malformedSellerId), `products/${malformedSellerId}/image.jpg`), bytes(1), { contentType: 'image/jpeg' }));
});
