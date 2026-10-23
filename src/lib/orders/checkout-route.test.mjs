import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST } from '@/app/api/orders/create/route';

beforeEach(() => {
  mock.restoreAll();
});

function createMockRequest(body, sessionCookie = 'valid-customer-session') {
  return {
    cookies: {
      get: (name) => (name === 'casaio_session' && sessionCookie ? { value: sessionCookie } : undefined),
    },
    json: async () => body,
  };
}

const validShippingAddress = {
  fullName: 'Aarav Patel',
  phoneNumber: '+91 9876543210',
  addressLine1: '42 Lotus Boulevard',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '400001',
  country: 'India',
};

const validCustomerDetails = {
  name: 'Aarav Patel',
  email: 'aarav@example.com',
  phone: '+91 9876543210',
};

function setupCouponCheckout(coupon, { productStock = 10, transactionProductStock = productStock, customerId = 'user-101', legacyOrders = [] } = {}) {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({ uid: customerId, email: 'aarav@example.com' }));
  const documents = new Map([
    [`users/${customerId}`, { role: 'customer', status: 'active' }],
    ['products/coupon-test-product', {
      title: 'Coupon Test Product',
      slug: 'coupon-test-product',
      price: 1000,
      stock: productStock,
      salesCount: 0,
      status: 'active',
      sellerId: 'seller-1',
      sellerStoreName: 'Seller One',
      images: [],
    }],
    ...(coupon ? [['coupons/coupon-1', coupon]] : []),
    ...legacyOrders.map(({ id, data }) => [`orders/${id}`, { customerId, ...data }]),
  ]);
  let orderCounter = 0;
  let transactionQueue = Promise.resolve();

  const makeRef = (collectionName, id) => ({
    id,
    path: `${collectionName}/${id}`,
    parent: collectionName.includes('/') ? { parent: { path: collectionName.split('/').slice(0, -1).join('/') } } : undefined,
    get: async () => {
      const data = documents.get(`${collectionName}/${id}`);
      return { exists: Boolean(data), data: () => data };
    },
    collection: (nestedName) => ({ doc: (nestedId) => makeRef(`${collectionName}/${id}/${nestedName}`, nestedId) }),
  });

  mock.method(adminDb, 'collection', (collectionName) => ({
    doc: (id) => makeRef(collectionName, id ?? `order-${++orderCounter}`),
    get: async () => ({
      docs: [...documents.entries()]
        .filter(([path]) => path.startsWith(`${collectionName}/`))
        .map(([path, data]) => ({ id: path.split('/')[1], ref: makeRef(collectionName, path.split('/')[1]), data: () => data })),
    }),
    where: (field, operator, value) => ({
      limit: (limit) => ({
        __transactionQuery: { collectionName, field, operator, value, limit },
        get: async () => ({ docs: [...documents.entries()]
          .filter(([path, data]) => path.startsWith(`${collectionName}/`) && data?.[field] === value)
          .slice(0, limit)
          .map(([path, data]) => ({ id: path.split('/').at(-1), ref: makeRef(collectionName, path.split('/').at(-1)), data: () => data })) }),
      }),
      where: () => ({
        limit: () => ({
          get: async () => {
            const rows = [...documents.entries()]
              .filter(([path, data]) => path.startsWith('coupons/') && data?.[field] === value)
              .slice(0, 2)
              .map(([path, data]) => {
                const id = path.split('/')[1];
                return { id, ref: makeRef('coupons', id), data: () => data };
              });
            return { empty: rows.length === 0, docs: rows };
          },
        }),
      }),
      get: async () => ({ docs: [] }),
    }),
    add: async (data) => ({ id: `notification-${Date.now()}`, data }),
  }));

  mock.method(adminDb, 'runTransaction', async (callback) => {
    const run = transactionQueue.then(async () => {
      const writes = [];
      const transaction = {
        get: async (ref) => {
          if (ref.__transactionQuery) {
            const { collectionName, field, operator, value, limit } = ref.__transactionQuery;
            const docs = [...documents.entries()]
              .filter(([path, data]) => path.startsWith(`${collectionName}/`) &&
                (operator === '==' ? data?.[field] === value : false))
              .slice(0, limit)
              .map(([path, data]) => ({
                id: path.split('/').at(-1),
                ref: makeRef(collectionName, path.split('/').at(-1)),
                data: () => data,
              }));
            return { docs };
          }
          const data = documents.get(ref.path);
          if (ref.path === 'products/coupon-test-product' && data) {
            return {
              exists: true,
              data: () => ({ ...data, stock: transactionProductStock }),
            };
          }
          return { exists: Boolean(data), data: () => data };
        },
        set: (ref, data) => writes.push({ kind: 'set', ref, data }),
        update: (ref, data) => writes.push({ kind: 'update', ref, data }),
      };
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.kind === 'set') documents.set(write.ref.path, write.data);
        else documents.set(write.ref.path, { ...(documents.get(write.ref.path) || {}), ...write.data });
      }
      return result;
    });
    transactionQueue = run.catch(() => {});
    return run;
  });

  const request = (checkoutRequestId, code = 'SAVE10', quantity = 1, extra = {}) => createMockRequest({
    checkoutRequestId,
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    paymentMethod: 'cod',
    couponCode: code,
    items: [{ productId: 'coupon-test-product', quantity }],
    ...extra,
  });

  return { documents, request };
}

function validFirestoreCoupon(overrides = {}) {
  const now = Date.now();
  return {
    code: 'SAVE10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderValue: 0,
    validFrom: new Date(now - 60_000).toISOString(),
    validUntil: new Date(now + 60_000).toISOString(),
    usageLimit: 2,
    usageCount: 0,
    perUserLimit: 1,
    isActive: true,
    ...overrides,
  };
}

function couponRequestId(suffix) {
  return `coupon-request-${suffix}-12345678`;
}

test('route handler: rejects unauthenticated user without session cookie', async () => {
  const req = createMockRequest({}, null);
  const res = await POST(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.match(data.error, /Authentication required/);
});

test('route handler: rejects missing or invalid checkoutRequestId', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  const req = createMockRequest({
    checkoutRequestId: 'short', // Invalid format
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /checkout request ID/);
});

test('route handler: rejects inactive/draft/archived product with 400', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'checkoutRequests' || colName === 'paymentAttempts' || colName === 'checkoutCoordinations') {
      return {
        doc: (id) => ({
          id,
          path: `mock/${colName}/${id}`,
          get: async () => ({ exists: false }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
      };
    }
    if (colName === 'products') {
      return {
        doc: (id) => ({
          id,
          path: `mock/products/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({
              id,
              title: 'Draft Walnut Stool',
              price: 5000,
              stock: 10,
              status: 'draft', // Not active!
              sellerId: 'seller-1',
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  const req = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345678',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    items: [{ productId: 'prod-draft', quantity: 1 }],
  });

  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /draft/);
});

test('route handler: rejects invalid or missing variant on variant product with 400', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'checkoutRequests' || colName === 'paymentAttempts' || colName === 'checkoutCoordinations') {
      return {
        doc: (id) => ({
          id,
          path: `mock/${colName}/${id}`,
          get: async () => ({ exists: false }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
      };
    }
    if (colName === 'products') {
      return {
        doc: (id) => ({
          id,
          path: `mock/products/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({
              id,
              title: 'Artisan Dining Table',
              hasVariants: true,
              variants: [
                { sku: 'TAB-6S', title: '6 Seater', price: 45000, stock: 3 },
              ],
              price: 45000,
              stock: 3,
              status: 'active',
              sellerId: 'seller-furniture',
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  // 1. Missing variantSku
  const reqMissing = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345679',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    items: [{ productId: 'table-1', quantity: 1 }],
  });
  const resMissing = await POST(reqMissing);
  assert.equal(resMissing.status, 400);
  const dataMissing = await resMissing.json();
  assert.match(dataMissing.error, /variant selection/);

  // 2. Non-existent variantSku
  const reqBogus = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345680',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    items: [{ productId: 'table-1', variantSku: 'TAB-10S', quantity: 1 }],
  });
  const resBogus = await POST(reqBogus);
  assert.equal(resBogus.status, 400);
  const dataBogus = await resBogus.json();
  assert.match(dataBogus.error, /does not exist/);
});

test('route handler: rejects insufficient stock in initial check with 400', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'checkoutRequests' || colName === 'paymentAttempts' || colName === 'checkoutCoordinations') {
      return {
        doc: (id) => ({
          id,
          path: `mock/${colName}/${id}`,
          get: async () => ({ exists: false }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
      };
    }
    if (colName === 'products') {
      return {
        doc: (id) => ({
          id,
          path: `mock/products/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({
              id,
              title: 'Handmade Silk Rug',
              price: 15000,
              stock: 2, // Only 2 available
              status: 'active',
              sellerId: 'seller-textiles',
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  const req = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345681',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    items: [{ productId: 'rug-1', quantity: 5 }], // Requesting 5
  });

  const res = await POST(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Insufficient stock/);
});

test('route handler: ignores client-supplied tampered prices and creates COD order with authoritative server values', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  let committedOrderRecord = null;
  let committedProductUpdate = null;
  let cartCleared = false;

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'checkoutRequests' || colName === 'paymentAttempts' || colName === 'checkoutCoordinations') {
      return {
        doc: (id) => ({
          id,
          path: `mock/${colName}/${id}`,
          get: async () => ({ exists: false }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
        doc: (id = 'ord-new-123') => ({
          id,
          path: `mock/orders/${id}`,
        }),
      };
    }
    if (colName === 'products') {
      return {
        doc: (id) => ({
          id,
          path: `mock/products/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({
              id,
              title: 'Hand-carved Teak Mirror',
              price: 14500, // Authentic server price
              stock: 8,
              salesCount: 15,
              status: 'active',
              sellerId: 'seller-carvings',
              sellerStoreName: 'Royal Carvings',
              costPerItem: 7000,
            }),
          }),
        }),
      };
    }
    if (colName === 'carts') {
      return {
        doc: (id) => ({
          id,
          path: `mock/carts/${id}`,
        }),
      };
    }
    if (colName === 'notifications') {
      return {
        add: async () => ({ id: 'notif-1' }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  mock.method(adminDb, 'runTransaction', async (txCallback) => {
    const tx = {
      get: async (ref) => {
        if (ref.path?.includes('products')) {
          return {
            exists: true,
            data: () => ({
              id: 'mirror-1',
              title: 'Hand-carved Teak Mirror',
              price: 14500,
              stock: 8,
              salesCount: 15,
              status: 'active',
              sellerId: 'seller-carvings',
              sellerStoreName: 'Royal Carvings',
            }),
          };
        }
        return { exists: false, data: () => null };
      },
      set: (ref, data) => {
        if (ref.path?.includes('orders')) {
          committedOrderRecord = data;
        }
        if (ref.path?.includes('carts')) {
          cartCleared = true;
        }
      },
      update: (ref, data) => {
        if (ref.path?.includes('products')) {
          committedProductUpdate = data;
        }
      },
    };
    return txCallback(tx);
  });

  const req = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345682',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    paymentMethod: 'cod',
    items: [
      {
        productId: 'mirror-1',
        quantity: 2,
        unitPrice: 10, // Tampered client price!
        sellerId: 'attacker-id', // Tampered sellerId!
      },
    ],
    totalAmount: 1,
    taxAmount: 999999,
    discountAmount: 999999,
  });

  const res = await POST(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.paymentMethod, 'cod');
  assert.equal(data.totalAmount, 29000); // 14500 * 2 = 29000

  // Verify committed order record
  assert.ok(committedOrderRecord);
  assert.equal(committedOrderRecord.items[0].unitPrice, 14500);
  assert.equal(committedOrderRecord.items[0].totalPrice, 29000);
  assert.equal(committedOrderRecord.items[0].sellerId, 'seller-carvings');
  assert.equal(committedOrderRecord.pricing.totalAmount, 29000);
  assert.equal(committedOrderRecord.pricing.subtotal, 29000);
  assert.equal(committedOrderRecord.pricing.taxAmount, 4423.73);
  assert.equal(committedOrderRecord.pricing.preTaxAmount, 24576.27);
  assert.equal(committedOrderRecord.pricing.payableItemsTotal, 29000);
  assert.equal(committedOrderRecord.payment.method, 'cod');
  assert.equal(committedOrderRecord.payment.status, 'pending');
  assert.equal(committedOrderRecord.orderStatus, 'confirmed');

  // Verify wholesale cost was not leaked
  assert.equal('costPerItem' in committedOrderRecord.items[0], false);

  // Verify atomic stock deduction
  assert.ok(committedProductUpdate);
  assert.equal(committedProductUpdate.stock, 6); // 8 - 2 = 6
  assert.equal(committedProductUpdate.salesCount, 17); // 15 + 2 = 17
  assert.equal(cartCleared, true);
});

test('route handler: cleanly aborts transaction with 400 when stock is depleted between read and commit', async () => {
  mock.method(adminAuth, 'verifySessionCookie', async () => ({
    uid: 'user-101',
    email: 'aarav@example.com',
  }));

  let writesCommitted = false;

  mock.method(adminDb, 'collection', (colName) => {
    if (colName === 'users') {
      return {
        doc: (id) => ({
          id,
          path: `mock/users/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({ role: 'customer', status: 'active' }),
          }),
        }),
      };
    }
    if (colName === 'checkoutRequests' || colName === 'paymentAttempts' || colName === 'checkoutCoordinations') {
      return {
        doc: (id) => ({
          id,
          path: `mock/${colName}/${id}`,
          get: async () => ({ exists: false }),
        }),
      };
    }
    if (colName === 'orders') {
      return {
        where: () => ({
          get: async () => ({ docs: [] }),
        }),
        doc: (id = 'ord-new-123') => ({
          id,
          path: `mock/orders/${id}`,
        }),
      };
    }
    if (colName === 'products') {
      return {
        doc: (id) => ({
          id,
          path: `mock/products/${id}`,
          get: async () => ({
            exists: true,
            data: () => ({
              id,
              title: 'Rare Vintage Vase',
              price: 20000,
              stock: 1, // Appears available during initial check
              salesCount: 3,
              status: 'active',
              sellerId: 'seller-vintage',
            }),
          }),
        }),
      };
    }
    if (colName === 'carts') {
      return {
        doc: (id) => ({
          id,
          path: `mock/carts/${id}`,
        }),
      };
    }
    throw new Error(`Unexpected collection ${colName}`);
  });

  // Inside transaction, simulate that another buyer just grabbed the last unit!
  mock.method(adminDb, 'runTransaction', async (txCallback) => {
    const tx = {
      get: async (ref) => {
        if (ref.path?.includes('products')) {
          return {
            exists: true,
            data: () => ({
              id: 'vase-1',
              title: 'Rare Vintage Vase',
              price: 20000,
              stock: 0, // Depleted in the database right now!
              salesCount: 4,
              status: 'out_of_stock',
              sellerId: 'seller-vintage',
            }),
          };
        }
        return { exists: false, data: () => null };
      },
      set: () => {
        writesCommitted = true;
      },
      update: () => {
        writesCommitted = true;
      },
    };
    return txCallback(tx);
  });

  const req = createMockRequest({
    checkoutRequestId: 'req-unique-id-12345683',
    customerDetails: validCustomerDetails,
    shippingAddress: validShippingAddress,
    paymentMethod: 'razorpay',
    items: [{ productId: 'vase-1', quantity: 1 }],
  });

  const res = await POST(req);
  assert.equal(res.status, 400); // Clean 400 error, not 500
  const data = await res.json();
  assert.match(data.error, /out_of_stock|not active|Insufficient stock/);
  assert.equal(writesCommitted, false); // Proves no partial deductions occurred!
});

test('route handler: consumes a valid Firestore coupon once when below its usage cap', async () => {
  const coupon = validFirestoreCoupon();
  const { documents, request } = setupCouponCheckout(coupon);

  const res = await POST(request(couponRequestId('valid'), 'SAVE10', 1, {
    couponTerms: {
      discountType: 'flat', discountValue: 999, minOrderValue: 999999,
      usageLimit: 999999, perUserLimit: 999999,
    },
  }));
  assert.equal(res.status, 200);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  const order = [...documents.entries()].find(([path]) => path.startsWith('orders/'))?.[1];
  assert.deepEqual(order?.couponApplied, {
    couponId: 'coupon-1',
    code: 'SAVE10',
    termsSnapshot: {
      version: 1,
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 0,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      usageLimit: 2,
      perUserLimit: 1,
    },
    discountAmount: 100,
    discountValue: 100,
  });
  assert.equal(order?.pricing?.discountAmount, 100);
});

test('route handler: omits absent optional shipping address fields from the persisted order', async () => {
  const coupon = validFirestoreCoupon();
  const { documents, request } = setupCouponCheckout(coupon);

  const response = await POST(request(couponRequestId('optional-address-fields')));
  assert.equal(response.status, 200);
  const order = [...documents.entries()].find(([path]) => path.startsWith('orders/'))?.[1];
  assert.ok(order);
  for (const field of ['alternatePhone', 'addressLine2', 'landmark', 'coordinates']) {
    assert.equal(Object.hasOwn(order.shippingAddress, field), false, `${field} must be omitted when absent`);
  }
});

test('route handler: rejects a registry mapping whose Firestore coupon code differs from the requested code', async () => {
  const coupon = validFirestoreCoupon();
  const { documents, request } = setupCouponCheckout(coupon);
  const codeId = createHash('sha256').update('OTHER10').digest('hex');
  documents.set(`couponCodes/${codeId}`, { couponId: 'coupon-1' });

  const res = await POST(request(couponRequestId('mismatched-registry'), 'OTHER10'));

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /does not match/i);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 0);
  assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 0);
});

test('route handler: rejects a Firestore coupon at its usage cap without changing usage', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 1, usageCount: 1 });
  const { documents, request } = setupCouponCheckout(coupon);

  const res = await POST(request(couponRequestId('at-cap')));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /usage limit/i);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 0);
});

test('route handler: rejects missing and malformed usageCount when a limit is configured', async (t) => {
  for (const [label, usageCount] of [['missing', undefined], ['malformed', '0']]) {
    await t.test(label, async () => {
      const coupon = validFirestoreCoupon({ usageCount });
      const { documents, request } = setupCouponCheckout(coupon);
      const res = await POST(request(couponRequestId(`bad-count-${label}`)));
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /usage configuration/i);
      assert.equal(documents.get('coupons/coupon-1').usageCount, usageCount);
      assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 0);
    });
  }
});

test('route handler: serializes concurrent attempts for the final Firestore coupon use', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 1, usageCount: 0 });
  const { documents, request } = setupCouponCheckout(coupon);

  const [first, second] = await Promise.all([
    POST(request(couponRequestId('concurrent-a'), 'SAVE10', 1)),
    POST(request(couponRequestId('concurrent-b'), 'SAVE10', 2)),
  ]);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  assert.deepEqual([first.status, second.status].sort(), [200, 400]);
  assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 1);
});

test('route handler: rejects expired and inactive Firestore coupons without consuming usage', async (t) => {
  const cases = [
    ['expired', validFirestoreCoupon({ validUntil: new Date(Date.now() - 60_000).toISOString() })],
    ['inactive', validFirestoreCoupon({ isActive: false })],
  ];
  for (const [label, coupon] of cases) {
    await t.test(label, async () => {
      const { documents, request } = setupCouponCheckout(coupon);
      const res = await POST(request(couponRequestId(`invalid-${label}`)));
      assert.equal(res.status, 400);
      assert.equal(documents.get('coupons/coupon-1').usageCount, 0);
      assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 0);
    });
  }
});

test('route handler: rejected checkout does not consume a valid coupon', async () => {
  const coupon = validFirestoreCoupon();
  const { documents, request } = setupCouponCheckout(coupon, { productStock: 10, transactionProductStock: 0 });

  const res = await POST(request(couponRequestId('no-stock')));
  assert.equal(res.status, 400);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 0);
  assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 0);
});

test('route handler: retrying the same checkout request does not consume coupon usage twice', async () => {
  const coupon = validFirestoreCoupon();
  const { documents, request } = setupCouponCheckout(coupon);
  const reqId = couponRequestId('retry');

  const first = await POST(request(reqId));
  const retry = await POST(request(reqId));
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).orderId, (await first.json()).orderId);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  assert.equal([...documents.keys()].filter((path) => path.startsWith('orders/')).length, 1);
});

test('route handler: pending COD order holds a per-user slot until delivery or cancellation', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 1 });
  const { documents, request } = setupCouponCheckout(coupon);

  const first = await POST(request(couponRequestId('user-slot-cod'), 'SAVE10', 1));
  assert.equal(first.status, 200);
  const usageEntry = [...documents.entries()].find(([path]) => path.startsWith('couponUserUsage/'));
  assert.equal(usageEntry?.[1].occupiedCount, 1);
  const reservation = [...documents.entries()].find(([path]) => path.includes('/reservations/'))?.[1];
  assert.equal(reservation?.state, 'awaiting_delivery');

  const second = await POST(request(couponRequestId('user-slot-second'), 'SAVE10', 2));
  assert.equal(second.status, 409);
  assert.match((await second.json()).error, /per-customer usage limit/i);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
});

test('route handler: online payment starts with one reserved per-user slot', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 1 });
  const { documents, request } = setupCouponCheckout(coupon);
  const response = await POST(request(couponRequestId('online-reservation'), 'SAVE10', 1, { paymentMethod: 'razorpay' }));
  assert.equal(response.status, 200);
  const usage = [...documents.entries()].find(([path]) => path.startsWith('couponUserUsage/'))?.[1];
  const reservation = [...documents.entries()].find(([path]) => path.includes('/reservations/'))?.[1];
  assert.equal(usage?.occupiedCount, 1);
  assert.equal(reservation?.state, 'reserved');
});

test('route handler: concurrent same-customer checkouts cannot take the final per-user slot twice', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 1 });
  const { documents, request } = setupCouponCheckout(coupon);
  const responses = await Promise.all([
    POST(request(couponRequestId('per-user-race-a'), 'SAVE10', 1)),
    POST(request(couponRequestId('per-user-race-b'), 'SAVE10', 2)),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const usage = [...documents.entries()].find(([path]) => path.startsWith('couponUserUsage/'))?.[1];
  assert.equal(usage?.occupiedCount, 1);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  assert.equal([...documents.keys()].filter((path) => /^orders\/order-/.test(path)).length, 1);
});

test('route handler: different authenticated customers receive independent coupon slots', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 1 });
  const first = setupCouponCheckout(coupon, { customerId: 'customer-one' });
  const firstResponse = await POST(first.request(couponRequestId('different-customer-one')));
  assert.equal(firstResponse.status, 200);

  mock.restoreAll();
  const second = setupCouponCheckout({ ...coupon, usageCount: 1 }, { customerId: 'customer-two' });
  const secondResponse = await POST(second.request(couponRequestId('different-customer-two')));
  assert.equal(secondResponse.status, 200);
  const usagePaths = [...second.documents.keys()].filter((path) => path.startsWith('couponUserUsage/'));
  assert.equal(usagePaths.length, 2);
});

test('route handler: legacy captured orders seed a complete per-user baseline', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 1 });
  const { documents, request } = setupCouponCheckout(coupon, {
    legacyOrders: [{
      id: 'legacy-captured-use',
      data: {
        couponApplied: { code: 'SAVE10', discountValue: 100 },
        payment: { method: 'razorpay', status: 'captured' },
        orderStatus: 'confirmed',
      },
    }],
  });

  const response = await POST(request(couponRequestId('legacy-limit')));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /per-customer usage limit/i);
  const usage = [...documents.entries()].find(([path]) => path.startsWith('couponUserUsage/'))?.[1];
  assert.equal(usage?.state, 'ready');
  assert.equal(usage?.occupiedCount, 1);
  const legacyReservation = [...documents.entries()].find(([path]) => path.endsWith('/reservations/legacy-captured-use'))?.[1];
  assert.equal(legacyReservation?.state, 'consumed');
  assert.equal([...documents.keys()].filter((path) => /^orders\/order-/.test(path)).length, 0);
});

test('route handler: oversized legacy history blocks coupon checkout without a partial baseline', async () => {
  const coupon = validFirestoreCoupon({ usageLimit: 10, perUserLimit: 5 });
  const legacyOrders = Array.from({ length: 9 }, (_, index) => ({
    id: `legacy-order-${index}`,
    data: { couponApplied: { code: 'SAVE10', discountValue: 100 }, payment: { method: 'razorpay', status: 'captured' } },
  }));
  const { documents, request } = setupCouponCheckout(coupon, { legacyOrders });

  const response = await POST(request(couponRequestId('oversized-history')));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /requires reconciliation/i);
  const usage = [...documents.entries()].find(([path]) => path.startsWith('couponUserUsage/'))?.[1];
  assert.equal(usage?.state, 'blocked');
  assert.equal('occupiedCount' in usage, false);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 0);
});

test('route handler: hardcoded campaign names are rejected unless Firestore defines them', async () => {
  for (const code of ['CASAIO10', 'WELCOME500']) {
    const { request } = setupCouponCheckout(null);
    const response = await POST(request(couponRequestId(`missing-${code}`), code));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /invalid or expired/i);
  }
});

test('route handler: campaign-like code uses only the Firestore definition and ignores browser discount values', async () => {
  const coupon = validFirestoreCoupon({ code: 'CASAIO10', discountValue: 3 });
  const { documents, request } = setupCouponCheckout(coupon);
  const response = await POST(request(couponRequestId('authoritative-campaign'), 'casaio10', 1, { discountAmount: 900 }));
  assert.equal(response.status, 200);
  assert.equal(documents.get('coupons/coupon-1').usageCount, 1);
  const order = [...documents.entries()].find(([path]) => path.startsWith('orders/'))?.[1];
  assert.equal(order?.pricing?.discountAmount, 30);
});
