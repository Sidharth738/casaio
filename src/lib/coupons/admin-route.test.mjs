
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { PATCH, POST } from '@/app/api/admin/coupons/route';

beforeEach(() => mock.restoreAll());

function setup({ admin = true } = {}) {
  const docs = new Map();
  let generatedId = 0;

  mock.method(
    adminAuth,
    'verifySessionCookie',
    async () => ({
      uid: 'admin-user',
      email: 'admin@example.test',
    })
  );

  mock.method(adminDb, 'collection', (name) => {
    if (name === 'users') {
      return {
        doc: (id) => ({
          path: `users/${id}`,
          get: async () => ({
            exists: admin,
            data: () => ({
              role: admin ? 'admin' : 'customer',
              status: 'active',
            }),
          }),
        }),
      };
    }

    return {
      path: name,
      doc: (id) => {
        const documentId = id ?? `generated-coupon-${++generatedId}`;
        return { id: documentId, path: `${name}/${documentId}` };
      },
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, data]) => ({
            id: path.split('/')[1],
            data: () => data,
          })),
      }),
    };
  });

  mock.method(adminDb, 'runTransaction', async (callback) => {
    const writes = [];

    const tx = {
      get: async (ref) => {
        if (ref.path === 'coupons') {
          return {
            docs: [...docs.entries()]
              .filter(([path]) => path.startsWith('coupons/'))
              .map(([path, data]) => ({
                id: path.split('/')[1],
                data: () => data,
              })),
          };
        }

        const data = docs.get(ref.path);

        return {
          exists: Boolean(data),
          data: () => data,
        };
      },

      create: (ref, data) => {
        writes.push(() => docs.set(ref.path, data));
      },

      update: (ref, data) => {
        writes.push(() =>
          docs.set(ref.path, {
            ...docs.get(ref.path),
            ...data,
          })
        );
      },
    };

    const result = await callback(tx);
    writes.forEach((apply) => apply());

    return result;
  });

  const request = (body) => ({
    cookies: {
      get: () => ({ value: 'session' }),
    },
    json: async () => body,
  });

  return { docs, request };
}

const definition = (overrides = {}) => ({
  code: ' deal10 ',
  description: 'Ten percent',
  discountType: 'percentage',
  discountValue: 10,
  minOrderValue: 0,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
  usageLimit: 100,
  perUserLimit: 1,
  usageCount: 999,
  isActive: true,
  ...overrides,
});

test('admin coupon route denies a non-admin', async () => {
  const { request } = setup({ admin: false });

  const response = await POST(request(definition()));

  assert.equal(response.status, 403);
});

test('admin coupon creation normalizes and permanently reserves a code without accepting accounting fields', async () => {
  const { docs, request } = setup();

  const response = await POST(request(definition()));

  assert.equal(response.status, 201);

  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.couponId, 'string');
  assert.ok(body.couponId.length > 0);

  const coupon = docs.get(`coupons/${body.couponId}`);

  assert.ok(coupon);
  assert.equal(coupon.code, 'DEAL10');
  assert.equal(coupon.usageCount, 0);
  assert.equal(typeof coupon.termsLockedAt, 'string');

  assert.equal(
    [...docs.keys()].filter((path) => path.startsWith('couponCodes/')).length,
    1
  );
});

test('duplicate normalized codes and reuse after deactivation are rejected', async () => {
  const { docs, request } = setup();

  const first = await POST(request(definition()));

  assert.equal(first.status, 201);

  const firstBody = await first.json();
  const couponId = firstBody.couponId;

  assert.equal(firstBody.success, true);
  assert.equal(typeof couponId, 'string');
  assert.ok(couponId.length > 0);

  const duplicateResponse = await POST(
    request(definition({ code: 'DEAL10' }))
  );

  assert.equal(duplicateResponse.status, 409);

  const createdCoupon = docs.get(`coupons/${couponId}`);

  assert.ok(createdCoupon);

  docs.set(`coupons/${couponId}`, {
    ...createdCoupon,
    usageCount: 17,
  });

  const deactivateResponse = await PATCH(
    request({ id: couponId, isActive: false })
  );

  assert.equal(deactivateResponse.status, 200);

  const reuseResponse = await POST(
    request(definition({ code: ' deal10 ' }))
  );

  assert.equal(reuseResponse.status, 409);

  assert.equal(
    docs.get(`coupons/${couponId}`).usageCount,
    17
  );
});

test('status route rejects attempts to edit terms or accounting fields', async () => {
  const { request } = setup();

  const accountingResponse = await PATCH(
    request({
      id: 'coupon-one',
      isActive: false,
      usageCount: 0,
    })
  );

  assert.equal(accountingResponse.status, 400);

  const termsResponse = await PATCH(
    request({
      id: 'coupon-one',
      isActive: false,
      discountValue: 1,
    })
  );

  assert.equal(termsResponse.status, 400);
});
