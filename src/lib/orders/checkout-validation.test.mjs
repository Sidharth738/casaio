import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShippingAddress,
  validatePurchasableProduct,
  calculateAuthoritativePricing,
  calculateStockUpdates,
} from './checkout-validation.js';

test('validateShippingAddress: rejects missing address or non-object', () => {
  assert.equal(validateShippingAddress(null).isValid, false);
  assert.equal(validateShippingAddress(undefined).isValid, false);
  assert.equal(validateShippingAddress('string').isValid, false);
});

test('validateShippingAddress: rejects when required fields are missing or blank', () => {
  const base = {
    fullName: 'Jane Doe',
    phoneNumber: '+91 9876543210',
    addressLine1: '123 Artisan Way',
    city: 'Jaipur',
    state: 'Rajasthan',
    postalCode: '302001',
  };

  assert.equal(validateShippingAddress({ ...base, fullName: '' }).isValid, false);
  assert.equal(validateShippingAddress({ ...base, phoneNumber: '   ' }).isValid, false);
  assert.equal(validateShippingAddress({ ...base, addressLine1: '' }).isValid, false);
  assert.equal(validateShippingAddress({ ...base, city: '' }).isValid, false);
  assert.equal(validateShippingAddress({ ...base, state: '' }).isValid, false);
  assert.equal(validateShippingAddress({ ...base, postalCode: '' }).isValid, false);
});

test('validateShippingAddress: accepts complete address and normalizes default country', () => {
  const result = validateShippingAddress({
    fullName: '  Jane Doe  ',
    phoneNumber: '9876543210',
    addressLine1: '  Flat 4B, Heritage Enclave  ',
    city: 'Jaipur',
    state: 'Rajasthan',
    postalCode: '302001',
  });

  assert.equal(result.isValid, true);
  assert.equal(result.cleanAddress?.fullName, 'Jane Doe');
  assert.equal(result.cleanAddress?.addressLine1, 'Flat 4B, Heritage Enclave');
  assert.equal(result.cleanAddress?.country, 'India');
});

test('validatePurchasableProduct: rejects missing or null product data', () => {
  const res = validatePurchasableProduct(null, { productId: 'prod-1', quantity: 1 });
  assert.equal(res.isValid, false);
  assert.match(res.error, /no longer available/);
});

test('validatePurchasableProduct: rejects products not in active status (draft, archived, out_of_stock)', () => {
  const baseProduct = {
    title: 'Teak Dining Chair',
    price: 12000,
    stock: 5,
    sellerId: 'seller-1',
  };

  const draftRes = validatePurchasableProduct({ ...baseProduct, status: 'draft' }, { productId: 'p1', quantity: 1 });
  assert.equal(draftRes.isValid, false);
  assert.match(draftRes.error, /draft/);

  const archivedRes = validatePurchasableProduct({ ...baseProduct, status: 'archived' }, { productId: 'p1', quantity: 1 });
  assert.equal(archivedRes.isValid, false);
  assert.match(archivedRes.error, /archived/);

  const oosRes = validatePurchasableProduct({ ...baseProduct, status: 'out_of_stock' }, { productId: 'p1', quantity: 1 });
  assert.equal(oosRes.isValid, false);
  assert.match(oosRes.error, /out_of_stock/);
});

test('validatePurchasableProduct: ignores tampered client prices and uses authentic server price', () => {
  const serverProduct = {
    title: 'Solid Brass Table Lamp',
    slug: 'solid-brass-lamp',
    price: 8500,
    stock: 10,
    status: 'active',
    sellerId: 'seller-brass',
    sellerStoreName: 'Heritage Brass Works',
    images: [{ url: 'https://images.casaio.com/lamp.jpg', isPrimary: true }],
    costPerItem: 4200, // Private wholesale dropshipping cost
  };

  // Client attempts to pass forged unitPrice of 100 INR and forged sellerId
  const tamperedItem = {
    productId: 'lamp-1',
    quantity: 2,
    unitPrice: 100, // Attacker forged price
    sellerId: 'attacker-seller', // Attacker forged seller
    imageUrl: 'https://evil.com/fake.jpg',
  };

  const res = validatePurchasableProduct(serverProduct, tamperedItem);
  assert.equal(res.isValid, true);
  assert.equal(res.verifiedItem?.unitPrice, 8500); // Authentic server price used
  assert.equal(res.verifiedItem?.totalPrice, 17000);
  assert.equal(res.verifiedItem?.sellerId, 'seller-brass'); // Authentic sellerId used
  assert.equal(res.verifiedItem?.imageUrl, 'https://images.casaio.com/lamp.jpg');

  // Verify wholesale cost is never exposed on OrderItem
  assert.equal('costPerItem' in (res.verifiedItem || {}), false);
});

test('validatePurchasableProduct: requires variant when product has variants', () => {
  const variantProduct = {
    title: 'Fluted Credenza',
    hasVariants: true,
    variants: [
      { sku: 'CRD-OAK', title: 'Oak', price: 25000, stock: 4 },
      { sku: 'CRD-WALNUT', title: 'Walnut', price: 28000, stock: 2 },
    ],
    status: 'active',
    sellerId: 'seller-wood',
  };

  // Request without variantSku
  const resMissing = validatePurchasableProduct(variantProduct, { productId: 'crd-1', quantity: 1 });
  assert.equal(resMissing.isValid, false);
  assert.match(resMissing.error, /requires a variant selection/);

  // Request with invalid variantSku
  const resInvalid = validatePurchasableProduct(variantProduct, { productId: 'crd-1', variantSku: 'CRD-PLASTIC', quantity: 1 });
  assert.equal(resInvalid.isValid, false);
  assert.match(resInvalid.error, /does not exist/);
});

test('validatePurchasableProduct: applies variant-specific price, title, and stock', () => {
  const variantProduct = {
    title: 'Fluted Credenza',
    hasVariants: true,
    variants: [
      { sku: 'CRD-OAK', title: 'Oak', price: 25000, stock: 4 },
      { sku: 'CRD-WALNUT', title: 'Walnut', price: 28000, stock: 1 },
    ],
    status: 'active',
    sellerId: 'seller-wood',
  };

  // Valid variant purchase
  const res = validatePurchasableProduct(variantProduct, { productId: 'crd-1', variantSku: 'CRD-WALNUT', quantity: 1 });
  assert.equal(res.isValid, true);
  assert.equal(res.verifiedItem?.unitPrice, 28000);
  assert.equal(res.verifiedItem?.variantSku, 'CRD-WALNUT');
  assert.match(res.verifiedItem?.title || '', /Walnut/);

  // Variant insufficient stock
  const resOos = validatePurchasableProduct(variantProduct, { productId: 'crd-1', variantSku: 'CRD-WALNUT', quantity: 2 });
  assert.equal(resOos.isValid, false);
  assert.match(resOos.error, /Insufficient stock/);
});

test('validatePurchasableProduct: rejects fake variant on non-variant product', () => {
  const simpleProduct = {
    title: 'Ceramic Vase',
    hasVariants: false,
    price: 3200,
    stock: 5,
    status: 'active',
    sellerId: 'seller-pottery',
  };

  const res = validatePurchasableProduct(simpleProduct, { productId: 'vase-1', variantSku: 'FAKE-VAR', quantity: 1 });
  assert.equal(res.isValid, false);
  assert.match(res.error, /does not support variant/);
});

test('calculateAuthoritativePricing: calculates correct subtotal, discounts, and total', () => {
  // 1. Without coupon
  const resNoCoupon = calculateAuthoritativePricing(10000);
  assert.equal(resNoCoupon.pricing.subtotal, 10000);
  assert.equal(resNoCoupon.pricing.discountAmount, 0);
  assert.equal(resNoCoupon.pricing.shippingFee, 0);
  assert.equal(resNoCoupon.pricing.taxAmount, 1800); // 18% GST breakdown
  assert.equal(resNoCoupon.pricing.totalAmount, 10000);

  // 2. Percentage coupon with minOrderValue
  const resPct = calculateAuthoritativePricing(10000, {
    code: 'CASAIO10',
    discountType: 'percentage',
    discountValue: 10,
    isActive: true,
  });
  assert.equal(resPct.pricing.discountAmount, 1000);
  assert.equal(resPct.pricing.totalAmount, 9000);
  assert.equal(resPct.appliedCoupon?.code, 'CASAIO10');

  // 3. Flat coupon with minOrderValue unmet
  const resFlatUnmet = calculateAuthoritativePricing(2000, {
    code: 'WELCOME500',
    discountType: 'flat',
    discountValue: 500,
    minOrderValue: 2999,
    isActive: true,
  });
  assert.equal(resFlatUnmet.pricing.discountAmount, 0);
  assert.equal(resFlatUnmet.pricing.totalAmount, 2000);

  // 4. Flat coupon with minOrderValue met
  const resFlatMet = calculateAuthoritativePricing(3500, {
    code: 'WELCOME500',
    discountType: 'flat',
    discountValue: 500,
    minOrderValue: 2999,
    isActive: true,
  });
  assert.equal(resFlatMet.pricing.discountAmount, 500);
  assert.equal(resFlatMet.pricing.totalAmount, 3000);
});

test('calculateStockUpdates: decrements stock and sales count on base product', () => {
  const product = {
    title: 'Handmade Wool Rug',
    stock: 5,
    salesCount: 12,
    status: 'active',
  };

  const res = calculateStockUpdates(product, [{ quantity: 2 }]);
  assert.equal(res.isValid, true);
  assert.equal(res.updatePayload?.stock, 3);
  assert.equal(res.updatePayload?.salesCount, 14);
  assert.equal(res.updatePayload?.status, 'active');
});

test('calculateStockUpdates: transitions base product to out_of_stock when inventory reaches 0', () => {
  const product = {
    title: 'Handmade Wool Rug',
    stock: 2,
    salesCount: 10,
    status: 'active',
  };

  const res = calculateStockUpdates(product, [{ quantity: 2 }]);
  assert.equal(res.isValid, true);
  assert.equal(res.updatePayload?.stock, 0);
  assert.equal(res.updatePayload?.status, 'out_of_stock');
});

test('calculateStockUpdates: decrements specific variant stock and transitions when all empty', () => {
  const productWithVariants = {
    title: 'Dining Table',
    hasVariants: true,
    stock: 3,
    salesCount: 5,
    status: 'active',
    variants: [
      { sku: 'DT-6S', title: '6 Seater', stock: 1, price: 40000, attributes: {} },
      { sku: 'DT-8S', title: '8 Seater', stock: 2, price: 55000, attributes: {} },
    ],
  };

  // Purchase the only 6 Seater
  const res1 = calculateStockUpdates(productWithVariants, [{ variantSku: 'DT-6S', quantity: 1 }]);
  assert.equal(res1.isValid, true);
  assert.equal(res1.updatePayload?.stock, 2);
  assert.equal(res1.updatePayload?.variants?.[0].stock, 0);
  assert.equal(res1.updatePayload?.variants?.[1].stock, 2);
  assert.equal(res1.updatePayload?.status, 'active'); // Still has 8 Seater stock

  // Purchase remaining 2 of 8 Seater
  const res2 = calculateStockUpdates({
    ...productWithVariants,
    stock: 2,
    variants: [
      { sku: 'DT-6S', title: '6 Seater', stock: 0, price: 40000, attributes: {} },
      { sku: 'DT-8S', title: '8 Seater', stock: 2, price: 55000, attributes: {} },
    ],
  }, [{ variantSku: 'DT-8S', quantity: 2 }]);
  assert.equal(res2.isValid, true);
  assert.equal(res2.updatePayload?.stock, 0);
  assert.equal(res2.updatePayload?.status, 'out_of_stock');
});

test('calculateStockUpdates: rejects when requested quantity exceeds available stock', () => {
  const product = {
    title: 'Ceramic Teapot',
    stock: 1,
    salesCount: 20,
    status: 'active',
  };

  const res = calculateStockUpdates(product, [{ quantity: 2 }]);
  assert.equal(res.isValid, false);
  assert.match(res.error, /Insufficient stock/);
});

test('calculateStockUpdates: rejects when product is not active during checkout transaction', () => {
  const product = {
    title: 'Ceramic Teapot',
    stock: 10,
    salesCount: 20,
    status: 'archived',
  };

  const res = calculateStockUpdates(product, [{ quantity: 1 }]);
  assert.equal(res.isValid, false);
  assert.match(res.error, /not active/);
});
