import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planMigrationUpdates,
  chunkUpdates,
  runMigration,
  BATCH_SIZE_LIMIT,
} from './migrate-legacy-seller-ids.ts';

test('planMigrationUpdates accurately assesses database records without I/O', () => {
  const records = [
    // 1. Modern order with valid sellerIds array
    {
      id: 'ord-modern',
      sellerIds: ['seller-1'],
      items: [{ sellerId: 'seller-1' }],
    },
    // 2. Legacy order needing backfill
    {
      id: 'ord-legacy-1',
      items: [{ sellerId: 'seller-alpha' }, { sellerId: 'seller-beta' }],
    },
    // 3. Legacy order with missing items
    {
      id: 'ord-empty',
      items: [],
    },
    // 4. Legacy order with invalid/empty sellerId in item
    {
      id: 'ord-no-valid-seller',
      items: [{ sellerId: '' }],
    },
  ];

  const plan = planMigrationUpdates(records);
  assert.equal(plan.alreadyHasSellerIdsCount, 1);
  assert.equal(plan.legacyNeedingBackfillCount, 1);
  assert.equal(plan.noItemsCount, 2);
  assert.equal(plan.updatesToApply.length, 1);
  assert.equal(plan.updatesToApply[0].orderId, 'ord-legacy-1');
  assert.deepEqual(plan.updatesToApply[0].derivedSellerIds, ['seller-alpha', 'seller-beta']);
});

test('chunkUpdates splits items into chunks of at most maxChunkSize', () => {
  const items = Array.from({ length: 1250 }, (_, i) => ({ id: `ord-${i}` }));
  const chunks = chunkUpdates(items, BATCH_SIZE_LIMIT);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 500);
  assert.equal(chunks[1].length, 500);
  assert.equal(chunks[2].length, 250);

  // Exact boundary at 500
  const exact500 = Array.from({ length: 500 }, (_, i) => i);
  assert.equal(chunkUpdates(exact500, 500).length, 1);

  // Zero items
  assert.deepEqual(chunkUpdates([], 500), []);

  // Invalid size guard
  assert.throws(() => chunkUpdates(items, 0), /must be greater than 0/);
});

// Mock Firestore DB builder
function createMockFirestore(ordersList) {
  const batchCommits = [];
  const batchUpdates = [];

  return {
    collection(name) {
      if (name !== 'orders') throw new Error(`Unexpected collection ${name}`);
      return {
        doc(id) {
          return { id, path: `orders/${id}` };
        },
        async get() {
          return {
            size: ordersList.length,
            docs: ordersList.map((ord) => ({
              id: ord.id,
              data: () => ({ ...ord }),
            })),
          };
        },
      };
    },
    batch() {
      const currentBatchUpdates = [];
      return {
        update(ref, data) {
          currentBatchUpdates.push({ ref, data });
          batchUpdates.push({ ref, data });
        },
        async commit() {
          batchCommits.push([...currentBatchUpdates]);
        },
      };
    },
    _getBatchCommits: () => batchCommits,
    _getBatchUpdates: () => batchUpdates,
  };
}

test('runMigration dry-run mode identifies pending updates without committing writes', async () => {
  const mockOrders = [
    { id: 'ord-1', items: [{ sellerId: 'seller-1' }] },
    { id: 'ord-2', items: [{ sellerId: 'seller-2' }] },
  ];
  const mockDb = createMockFirestore(mockOrders);
  const logLines = [];
  const customLogger = {
    log: (...args) => logLines.push(args.join(' ')),
    error: () => {},
  };

  const result = await runMigration({
    write: false,
    db: mockDb,
    logger: customLogger,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.updated, 0);
  assert.equal(result.pending, 2);
  assert.equal(mockDb._getBatchCommits().length, 0);
  assert.ok(logLines.some((l) => l.includes('DRY RUN COMPLETE')));
});

test('runMigration handles zero changes when all orders already have sellerIds', async () => {
  const mockOrders = [
    { id: 'ord-1', sellerIds: ['seller-1'], items: [{ sellerId: 'seller-1' }] },
    { id: 'ord-2', sellerIds: ['seller-2'], items: [{ sellerId: 'seller-2' }] },
  ];
  const mockDb = createMockFirestore(mockOrders);

  const result = await runMigration({
    write: true,
    db: mockDb,
    logger: { log: () => {}, error: () => {} },
  });

  assert.equal(result.updated, 0);
  assert.equal(result.batches, 0);
  assert.equal(mockDb._getBatchCommits().length, 0);
});

test('runMigration commits fewer than 500 changes in a single batch', async () => {
  const count = 150;
  const mockOrders = Array.from({ length: count }, (_, i) => ({
    id: `ord-${i}`,
    items: [{ sellerId: `seller-${i % 5}` }],
  }));
  const mockDb = createMockFirestore(mockOrders);

  const result = await runMigration({
    write: true,
    db: mockDb,
    logger: { log: () => {}, error: () => {} },
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.updated, 150);
  assert.equal(result.batches, 1);
  assert.equal(mockDb._getBatchCommits().length, 1);
  assert.equal(mockDb._getBatchCommits()[0].length, 150);
});

test('runMigration commits more than 500 changes across multiple chunks of at most 500', async () => {
  const count = 1150;
  const mockOrders = Array.from({ length: count }, (_, i) => ({
    id: `ord-${i}`,
    items: [{ sellerId: `seller-${i % 3}` }],
  }));
  const mockDb = createMockFirestore(mockOrders);

  const result = await runMigration({
    write: true,
    db: mockDb,
    batchSize: 500,
    logger: { log: () => {}, error: () => {} },
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.updated, 1150);
  assert.equal(result.batches, 3);
  assert.equal(mockDb._getBatchCommits().length, 3);
  assert.equal(mockDb._getBatchCommits()[0].length, 500);
  assert.equal(mockDb._getBatchCommits()[1].length, 500);
  assert.equal(mockDb._getBatchCommits()[2].length, 150);
});

test('runMigration halts cleanly and reports error if a batch commit fails', async () => {
  const mockOrders = Array.from({ length: 15 }, (_, i) => ({
    id: `ord-${i}`,
    items: [{ sellerId: 'seller-1' }],
  }));

  const mockDb = {
    collection: () => ({
      doc: (id) => ({ id, path: `orders/${id}` }),
      async get() {
        return {
          size: mockOrders.length,
          docs: mockOrders.map((o) => ({ id: o.id, data: () => o })),
        };
      },
    }),
    batch: () => ({
      update: () => {},
      commit: async () => {
        throw new Error('Firestore UNAVAILABLE error');
      },
    }),
  };

  await assert.rejects(
    () =>
      runMigration({
        write: true,
        db: mockDb,
        logger: { log: () => {}, error: () => {} },
      }),
    /Migration aborted during batch 1 of 1: Firestore UNAVAILABLE error/
  );
});
