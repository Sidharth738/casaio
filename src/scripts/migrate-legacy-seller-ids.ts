/**
 * Casaio Legacy Order Migration Script
 * 
 * Backfills the `sellerIds` indexed array on legacy orders that were created
 * before multi-vendor querying was implemented.
 * 
 * SAFETY CONTROLS:
 * - Runs in DRY-RUN mode by default.
 * - Requires explicit `--write` flag to commit updates.
 * - Commits writes in chunks of no more than 500 operations (Firestore batch limit).
 * - Strictly NO personal customer data (names, emails, addresses, phones) or payment secrets are logged.
 * - Derives seller IDs solely from authentic line item sellerId properties.
 * 
 * Usage:
 *   Dry-run (default, safe):
 *     npx tsx src/scripts/migrate-legacy-seller-ids.ts
 * 
 *   Write mode (applies updates in <=500 batch chunks):
 *     npx tsx src/scripts/migrate-legacy-seller-ids.ts --write
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { deriveSellerIdsFromItems } from '../lib/orders/legacy-compatibility';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const BATCH_SIZE_LIMIT = 500;

export interface OrderRecord {
  id: string;
  sellerIds?: string[];
  items?: Array<{ sellerId?: string }>;
}

export interface MigrationUpdate {
  orderId: string;
  derivedSellerIds: string[];
}

export interface MigrationAssessment {
  alreadyHasSellerIdsCount: number;
  legacyNeedingBackfillCount: number;
  noItemsCount: number;
  updatesToApply: MigrationUpdate[];
}

/**
 * Pure evaluation function: determines which orders need backfilling without performing any I/O.
 */
export function planMigrationUpdates(orders: OrderRecord[]): MigrationAssessment {
  let alreadyHasSellerIdsCount = 0;
  let legacyNeedingBackfillCount = 0;
  let noItemsCount = 0;
  const updatesToApply: MigrationUpdate[] = [];

  for (const data of orders) {
    if (Array.isArray(data.sellerIds) && data.sellerIds.length > 0) {
      alreadyHasSellerIdsCount++;
      continue;
    }

    const items = data.items;
    if (!Array.isArray(items) || items.length === 0) {
      noItemsCount++;
      continue;
    }

    const derivedSellerIds = deriveSellerIdsFromItems(items);
    if (derivedSellerIds.length === 0) {
      noItemsCount++;
      continue;
    }

    legacyNeedingBackfillCount++;
    updatesToApply.push({ orderId: data.id, derivedSellerIds });
  }

  return {
    alreadyHasSellerIdsCount,
    legacyNeedingBackfillCount,
    noItemsCount,
    updatesToApply,
  };
}

/**
 * Splits an array into chunks of specified maximum size (defaults to Firestore limit of 500).
 */
export function chunkUpdates<T>(items: T[], size = BATCH_SIZE_LIMIT): T[][] {
  if (size <= 0) throw new Error('Chunk size must be greater than 0');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getLazyDefaultDb(): Firestore {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'casaio-app';

  if (getApps().length === 0) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      initializeApp({ projectId });
    }
  }

  return getFirestore();
}

export interface RunMigrationOptions {
  write?: boolean;
  db?: Firestore;
  batchSize?: number;
  logger?: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export async function runMigration(options: RunMigrationOptions = {}) {
  const logger = options.logger ?? console;
  const writeEnabled = options.write ?? process.argv.includes('--write');
  const batchSize = Math.min(options.batchSize ?? BATCH_SIZE_LIMIT, BATCH_SIZE_LIMIT);

  logger.log('='.repeat(60));
  logger.log('Casaio Legacy Order `sellerIds` Migration');
  logger.log(`Mode: ${writeEnabled ? 'WRITE (Live updates enabled)' : 'DRY RUN (No changes will be saved)'}`);
  logger.log(`Max Batch Chunk Size: ${batchSize} operations per commit`);
  logger.log('='.repeat(60));

  const db = options.db ?? getLazyDefaultDb();
  const ordersSnapshot = await db.collection('orders').get();
  logger.log(`Found ${ordersSnapshot.size} total orders.`);

  const orders: OrderRecord[] = ordersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<OrderRecord, 'id'>),
  }));

  const assessment = planMigrationUpdates(orders);

  logger.log('\n--- Migration Assessment ---');
  logger.log(`- Orders already possessing valid sellerIds: ${assessment.alreadyHasSellerIdsCount}`);
  logger.log(`- Legacy orders needing sellerIds backfill:  ${assessment.legacyNeedingBackfillCount}`);
  logger.log(`- Orders with empty/missing line items:      ${assessment.noItemsCount}`);

  if (assessment.updatesToApply.length === 0) {
    logger.log('\nNo legacy orders require migration. Database is up to date.');
    return {
      scanned: ordersSnapshot.size,
      updated: 0,
      batches: 0,
      dryRun: !writeEnabled,
    };
  }

  logger.log('\n--- Target Order Identifiers (Zero PII / Secrets Logged) ---');
  for (const update of assessment.updatesToApply) {
    logger.log(
      `Order ID: [${update.orderId}] -> Derived Seller IDs count: ${update.derivedSellerIds.length} (${update.derivedSellerIds.join(', ')})`
    );
  }

  if (!writeEnabled) {
    logger.log('\n[DRY RUN COMPLETE] No records were modified.');
    logger.log('To apply these changes, run with the `--write` flag.');
    return {
      scanned: ordersSnapshot.size,
      updated: 0,
      pending: assessment.updatesToApply.length,
      batches: Math.ceil(assessment.updatesToApply.length / batchSize),
      dryRun: true,
    };
  }

  const chunks = chunkUpdates(assessment.updatesToApply, batchSize);
  logger.log(`\n[COMMITTING WRITES] Applying batch updates across ${chunks.length} chunk(s)...`);

  let committedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.log(`Writing batch ${i + 1}/${chunks.length} (${chunk.length} orders)...`);

    try {
      const batch = db.batch();
      for (const update of chunk) {
        const ref = db.collection('orders').doc(update.orderId);
        batch.update(ref, {
          sellerIds: update.derivedSellerIds,
          updatedAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      committedCount += chunk.length;
      logger.log(`✓ Batch ${i + 1}/${chunks.length} committed successfully.`);
    } catch (batchErr) {
      logger.error(`✗ Error committing batch ${i + 1}/${chunks.length}:`, batchErr);
      throw new Error(
        `Migration aborted during batch ${i + 1} of ${chunks.length}: ${
          batchErr instanceof Error ? batchErr.message : String(batchErr)
        }. Committed before failure: ${committedCount} orders.`
      );
    }
  }

  logger.log(`\n[SUCCESS] Backfilled \`sellerIds\` on ${committedCount} legacy orders in ${chunks.length} batch(es).`);
  return {
    scanned: ordersSnapshot.size,
    updated: committedCount,
    batches: chunks.length,
    dryRun: false,
  };
}

// Execute when invoked directly from CLI
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
