import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { POST as submitReview } from '@/app/api/reviews/create/route';
import { POST as moderateReview } from '@/app/api/admin/reviews/[id]/route';

beforeEach(() => mock.restoreAll());

function setup(initialReviews = []) {
  const docs = new Map([
    ['products/product-1', { status: 'active', ratings: { average: 5, count: 0 } }],
    ['users/customer-1', { displayName: 'Customer', status: 'active', role: 'customer' }],
    ['users/admin-1', { displayName: 'Admin', status: 'active', role: 'admin' }],
  ]);
  for (const review of initialReviews) docs.set(`reviews/${review.id}`, { ...review });
  let generatedId = 0;
  let transactionQueue = Promise.resolve();

  const documentRef = (collectionName, id) => ({
    id,
    path: `${collectionName}/${id}`,
    get: async () => snapshot(docs, `${collectionName}/${id}`),
  });
  const snapshot = (store, path) => ({
    id: path.split('/')[1],
    exists: store.has(path),
    data: () => store.get(path),
  });
  const queryDocs = (collectionName, filters = []) => [...docs.entries()]
    .filter(([path, data]) => path.startsWith(`${collectionName}/`) &&
      filters.every(([field, value]) => data[field] === value))
    .map(([path, data]) => ({ id: path.split('/')[1], ref: documentRef(collectionName, path.split('/')[1]), data: () => data }));
  const collection = (name) => ({
    doc: (id) => documentRef(name, id || `review-${++generatedId}`),
    add: async (data) => {
      const ref = documentRef(name, `review-${++generatedId}`);
      docs.set(ref.path, data);
      return ref;
    },
    where: (field, _operator, value) => ({
      collection: name,
      filters: [[field, value]],
      get: async () => ({ docs: queryDocs(name, [[field, value]]) }),
    }),
  });

  mock.method(adminDb, 'collection', collection);
  mock.method(adminAuth, 'verifySessionCookie', async (cookie) => ({
    uid: cookie === 'admin-session' ? 'admin-1' : 'customer-1',
    email: 'customer@example.test',
  }));
  mock.method(adminDb, 'runTransaction', (callback) => {
    const run = async () => {
      const writes = [];
      const transaction = {
        get: async (ref) => ref.collection
          ? { docs: queryDocs(ref.collection, ref.filters) }
          : snapshot(docs, ref.path),
        create: (ref, data) => writes.push(() => docs.set(ref.path, data)),
        update: (ref, data) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...data })),
        delete: (ref) => writes.push(() => docs.delete(ref.path)),
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    };
    const result = transactionQueue.then(run, run);
    transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  });

  const request = (body, session = 'customer-session') => ({
    cookies: { get: () => ({ value: session }) },
    json: async () => body,
  });
  return { docs, request };
}

const submission = (rating = 4) => ({
  productId: 'product-1', rating, title: 'Good item', comment: 'Looks great at home.',
});

test('review submission writes the authoritative aggregate in ratings', async () => {
  const { docs, request } = setup();
  const response = await submitReview(request(submission(4)));

  assert.equal(response.status, 200);
  assert.deepEqual(docs.get('products/product-1').ratings, { average: 4, count: 1 });
  assert.equal(docs.get('products/product-1').rating, undefined);
  assert.equal(docs.get('products/product-1').reviewCount, undefined);
});

test('duplicate and concurrent review submissions do not create duplicate reviews or counts', async () => {
  const { docs, request } = setup();
  const responses = await Promise.all([
    submitReview(request(submission(4))),
    submitReview(request(submission(5))),
  ]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal([...docs.keys()].filter((path) => path.startsWith('reviews/')).length, 1);
  assert.deepEqual(docs.get('products/product-1').ratings, { average: 4, count: 1 });
});

test('approval and rejection recalculate published average and count exactly once', async () => {
  const { docs, request } = setup([
    { id: 'first', productId: 'product-1', userId: 'a', rating: 2, status: 'pending' },
    { id: 'second', productId: 'product-1', userId: 'b', rating: 5, status: 'published' },
  ]);
  const adminRequest = (body) => request(body, 'admin-session');

  assert.equal((await moderateReview(adminRequest({ status: 'published' }), { params: Promise.resolve({ id: 'first' }) })).status, 200);
  assert.deepEqual(docs.get('products/product-1').ratings, { average: 3.5, count: 2 });
  assert.equal((await moderateReview(adminRequest({ status: 'published' }), { params: Promise.resolve({ id: 'first' }) })).status, 200);
  assert.deepEqual(docs.get('products/product-1').ratings, { average: 3.5, count: 2 });

  assert.equal((await moderateReview(adminRequest({ status: 'hidden' }), { params: Promise.resolve({ id: 'first' }) })).status, 200);
  assert.deepEqual(docs.get('products/product-1').ratings, { average: 5, count: 1 });
});

test('concurrent approval and rejection produce the aggregate for the final review state', async () => {
  const { docs, request } = setup([
    { id: 'first', productId: 'product-1', userId: 'a', rating: 2, status: 'pending' },
    { id: 'second', productId: 'product-1', userId: 'b', rating: 5, status: 'published' },
  ]);
  const adminRequest = (body) => request(body, 'admin-session');
  await Promise.all([
    moderateReview(adminRequest({ status: 'published' }), { params: Promise.resolve({ id: 'first' }) }),
    moderateReview(adminRequest({ status: 'hidden' }), { params: Promise.resolve({ id: 'second' }) }),
  ]);

  assert.deepEqual(docs.get('products/product-1').ratings, { average: 2, count: 1 });
});
