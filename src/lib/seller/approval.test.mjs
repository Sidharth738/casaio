import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSellerApproved,
  checkSellerOperationPermission,
} from './auth.ts';

test('isSellerApproved accurately identifies approval state', () => {
  assert.equal(isSellerApproved({ status: 'approved' }), true);
  assert.equal(isSellerApproved({ status: 'pending' }), false);
  assert.equal(isSellerApproved({ status: 'suspended' }), false);
  assert.equal(isSellerApproved({ status: 'rejected' }), false);
  assert.equal(isSellerApproved(null), false);
  assert.equal(isSellerApproved(undefined), false);
});

test('checkSellerOperationPermission allows approved seller', () => {
  const user = { uid: 'seller_1', role: 'seller' };
  const sellerData = { status: 'approved' };
  const result = checkSellerOperationPermission(user, sellerData);

  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test('checkSellerOperationPermission rejects unauthenticated user', () => {
  const result = checkSellerOperationPermission(null, { status: 'approved' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 401);
});

test('checkSellerOperationPermission rejects customer role even if a seller doc exists', () => {
  const user = { uid: 'user_1', role: 'customer' };
  const sellerData = { status: 'approved' };
  const result = checkSellerOperationPermission(user, sellerData);

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /Seller access required/);
});

test('checkSellerOperationPermission rejects seller when seller doc is missing', () => {
  const user = { uid: 'seller_1', role: 'seller' };
  const result = checkSellerOperationPermission(user, null);

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /Seller profile not found/);
});

test('checkSellerOperationPermission rejects pending seller application', () => {
  const user = { uid: 'seller_1', role: 'seller' };
  const sellerData = { status: 'pending' };
  const result = checkSellerOperationPermission(user, sellerData);

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /pending admin review/);
});

test('checkSellerOperationPermission rejects suspended seller account', () => {
  const user = { uid: 'seller_1', role: 'seller' };
  const sellerData = { status: 'suspended' };
  const result = checkSellerOperationPermission(user, sellerData);

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /suspended/);
});

test('checkSellerOperationPermission rejects rejected seller application', () => {
  const user = { uid: 'seller_1', role: 'seller' };
  const sellerData = { status: 'rejected' };
  const result = checkSellerOperationPermission(user, sellerData);

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /not approved/);
});

test('checkSellerOperationPermission preserves admin access regardless of seller status', () => {
  const adminUser = { uid: 'admin_1', role: 'admin' };

  // Admin with no seller doc
  assert.equal(checkSellerOperationPermission(adminUser, null).allowed, true);

  // Admin with suspended seller doc
  assert.equal(
    checkSellerOperationPermission(adminUser, { status: 'suspended' }).allowed,
    true
  );

  // Admin with pending seller doc
  assert.equal(
    checkSellerOperationPermission(adminUser, { status: 'pending' }).allowed,
    true
  );
});

test('regression: status transitions from approved to pending/suspended/rejected revoke permission', () => {
  const user = { uid: 'seller_1', role: 'seller' };

  // Initially approved
  let sellerData = { status: 'approved' };
  assert.equal(checkSellerOperationPermission(user, sellerData).allowed, true);

  // Admin changes status to 'suspended'
  sellerData = { status: 'suspended' };
  assert.equal(checkSellerOperationPermission(user, sellerData).allowed, false);

  // Admin changes status to 'pending' (application review reopened)
  sellerData = { status: 'pending' };
  assert.equal(checkSellerOperationPermission(user, sellerData).allowed, false);

  // Admin changes status to 'rejected'
  sellerData = { status: 'rejected' };
  assert.equal(checkSellerOperationPermission(user, sellerData).allowed, false);
});
