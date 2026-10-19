import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SellerApplicationSchema, SellerProfileUpdateSchema } from './seller-profile.ts';

const application = {
  storeName: 'Test Store',
  storeEmail: 'owner@example.test',
  storePhone: '1234567890',
  description: 'A small artisan seller.',
  businessAddress: {
    street: 'Main Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India',
  },
};

test('seller application schema accepts registration fields only', () => {
  assert.equal(SellerApplicationSchema.safeParse(application).success, true);
  assert.equal(SellerApplicationSchema.safeParse({ ...application, status: 'approved' }).success, false);
  assert.equal(SellerApplicationSchema.safeParse({ ...application, commissionRatePercent: 0 }).success, false);
  assert.equal(SellerApplicationSchema.safeParse({ ...application, metrics: { totalSalesAmount: 1 } }).success, false);
});

test('seller profile schema permits validated profile and payout updates but rejects privileged fields', () => {
  assert.equal(SellerProfileUpdateSchema.safeParse({ storeName: 'New Store' }).success, true);
  assert.equal(SellerProfileUpdateSchema.safeParse({ payoutDetails: {
    accountHolderName: 'Owner', accountNumber: '123456', ifscCode: 'TEST0001234',
  } }).success, true);
  assert.equal(SellerProfileUpdateSchema.safeParse({ status: 'approved' }).success, false);
  assert.equal(SellerProfileUpdateSchema.safeParse({ commissionRatePercent: 1 }).success, false);
  assert.equal(SellerProfileUpdateSchema.safeParse({ metrics: {} }).success, false);
});
