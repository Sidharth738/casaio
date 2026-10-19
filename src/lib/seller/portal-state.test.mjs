import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSellerPortalAccessState } from './portal-state.ts';

test('resolveSellerPortalAccessState handles loading states', () => {
  assert.equal(
    resolveSellerPortalAccessState({
      user: null,
      authLoading: true,
      profileLoading: false,
      sellerProfile: null,
    }),
    'loading'
  );

  assert.equal(
    resolveSellerPortalAccessState({
      user: { uid: 'user-1' },
      authLoading: false,
      profileLoading: true,
      sellerProfile: null,
    }),
    'loading'
  );
});

test('resolveSellerPortalAccessState gates unauthenticated visitors', () => {
  const result = resolveSellerPortalAccessState({
    user: null,
    role: null,
    sellerProfile: null,
    authLoading: false,
    profileLoading: false,
  });

  assert.equal(result, 'unauthenticated');
});

test('resolveSellerPortalAccessState allows admin bypass regardless of profile status', () => {
  // Admin with no seller profile
  assert.equal(
    resolveSellerPortalAccessState({
      user: { uid: 'admin-1' },
      role: 'admin',
      sellerProfile: null,
      authLoading: false,
      profileLoading: false,
    }),
    'authorized'
  );

  // Admin with suspended profile
  assert.equal(
    resolveSellerPortalAccessState({
      user: { uid: 'admin-1' },
      role: 'admin',
      sellerProfile: { status: 'suspended', storeName: 'Admin Store' },
      authLoading: false,
      profileLoading: false,
    }),
    'authorized'
  );
});

test('resolveSellerPortalAccessState guides unregistered users to application', () => {
  const result = resolveSellerPortalAccessState({
    user: { uid: 'cust-1' },
    role: 'customer',
    sellerProfile: null,
    authLoading: false,
    profileLoading: false,
  });

  assert.equal(result, 'unregistered');
});

test('resolveSellerPortalAccessState authorizes approved sellers', () => {
  const result = resolveSellerPortalAccessState({
    user: { uid: 'seller-1' },
    role: 'seller',
    sellerProfile: { status: 'approved', storeName: 'Artisan Woodworks' },
    authLoading: false,
    profileLoading: false,
  });

  assert.equal(result, 'authorized');
});

test('resolveSellerPortalAccessState gates pending applicants even with seller token claim', () => {
  const result = resolveSellerPortalAccessState({
    user: { uid: 'seller-1' },
    role: 'seller', // Token claim might lag
    sellerProfile: { status: 'pending', storeName: 'Pending Store' },
    authLoading: false,
    profileLoading: false,
  });

  assert.equal(result, 'pending');
});

test('resolveSellerPortalAccessState revokes portal access immediately for suspended sellers', () => {
  // Case A: token claim still says 'seller'
  const staleClaimResult = resolveSellerPortalAccessState({
    user: { uid: 'seller-1' },
    role: 'seller',
    sellerProfile: {
      status: 'suspended',
      storeName: 'Suspended Atelier',
      statusReason: 'Counterfeit listing investigation',
    },
    authLoading: false,
    profileLoading: false,
  });
  assert.equal(staleClaimResult, 'suspended');

  // Case B: token claim already downgraded to 'customer'
  const refreshedClaimResult = resolveSellerPortalAccessState({
    user: { uid: 'seller-1' },
    role: 'customer',
    sellerProfile: {
      status: 'suspended',
      storeName: 'Suspended Atelier',
      statusReason: 'Repeated late shipments',
    },
    authLoading: false,
    profileLoading: false,
  });
  assert.equal(refreshedClaimResult, 'suspended');
});

test('resolveSellerPortalAccessState presents rejected status screen for denied applications', () => {
  const result = resolveSellerPortalAccessState({
    user: { uid: 'applicant-1' },
    role: 'customer',
    sellerProfile: {
      status: 'rejected',
      storeName: 'Rejected Decor',
      statusReason: 'Does not meet curated catalog quality standards',
    },
    authLoading: false,
    profileLoading: false,
  });

  assert.equal(result, 'rejected');
});
