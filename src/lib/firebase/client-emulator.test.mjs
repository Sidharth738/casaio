import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LOCAL_FIREBASE_EMULATOR_ENDPOINTS,
  LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  resolveFirebaseEmulatorConfiguration,
} from '@/lib/firebase/emulator-config-core';
import { connectFirebaseEmulatorServices } from '@/lib/firebase/client-emulator';

const enabledConfiguration = resolveFirebaseEmulatorConfiguration({
  NODE_ENV: 'development',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  GCLOUD_PROJECT: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore,
  FIREBASE_AUTH_EMULATOR_HOST: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth,
  FIREBASE_STORAGE_EMULATOR_HOST: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage,
  STORAGE_EMULATOR_HOST: `http://${LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage}`,
});

function connectors(calls) {
  return {
    firestore: (host) => calls.push(['firestore', host]),
    auth: (host) => calls.push(['auth', host]),
    storage: (host) => calls.push(['storage', host]),
  };
}

test('browser Web SDK binds Firestore, Auth, and Storage to the fixed loopback emulators', () => {
  const calls = [];
  connectFirebaseEmulatorServices(enabledConfiguration, connectors(calls), new Set(), true);
  assert.deepEqual(calls, [
    ['firestore', '127.0.0.1:18080'],
    ['auth', '127.0.0.1:9099'],
    ['storage', '127.0.0.1:9199'],
  ]);
});

test('server Web Firestore is emulator-bound before any server-side operation', () => {
  const calls = [];
  connectFirebaseEmulatorServices(enabledConfiguration, connectors(calls), new Set(), false);
  assert.deepEqual(calls, [['firestore', '127.0.0.1:18080']]);
});

test('server Firestore emulator binding is idempotent across module reloads', () => {
  const calls = [];
  const connections = new Set();
  connectFirebaseEmulatorServices(enabledConfiguration, connectors(calls), connections, false);
  connectFirebaseEmulatorServices(enabledConfiguration, connectors(calls), connections, false);
  assert.deepEqual(calls, [['firestore', '127.0.0.1:18080']]);
});

test('invalid emulator project or endpoint fails before connecting any Web SDK service', () => {
  for (const configuration of [
    { ...enabledConfiguration, projectId: 'production-project' },
    { ...enabledConfiguration, firestoreHost: 'firestore.googleapis.com:443' },
  ]) {
    const calls = [];
    assert.throws(() => connectFirebaseEmulatorServices(
      configuration,
      connectors(calls),
      new Set(),
      false,
    ), /not loopback-bound/);
    assert.deepEqual(calls, []);
  }
});

test('Admin SDK emulator preflight rejects invalid project IDs and endpoints', () => {
  assert.throws(() => resolveFirebaseEmulatorConfiguration({
    NODE_ENV: 'development',
    NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
    FIREBASE_PROJECT_ID: 'production-project',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  }), /explicit demo project ID/);
  assert.throws(() => resolveFirebaseEmulatorConfiguration({
    NODE_ENV: 'development',
    NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
    FIREBASE_PROJECT_ID: 'demo-casaio-rules',
    FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443',
  }), /loopback endpoints/);

  const admin = readFileSync(resolve('src/lib/firebase/admin.ts'), 'utf8');
  for (const name of [
    'FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT',
    'FIRESTORE_EMULATOR_HOST',
  ]) assert.ok(admin.includes(`${name}: process.env.${name}`));
});

test('Admin Refunds page and API use the server Admin path, not browser Firestore', () => {
  const page = readFileSync(resolve('src/app/(admin)/admin/refunds/page.tsx'), 'utf8');
  const route = readFileSync(resolve('src/app/api/admin/payment-reconciliation/route.ts'), 'utf8');
  const admin = readFileSync(resolve('src/lib/firebase/admin.ts'), 'utf8');

  assert.doesNotMatch(page, /firebase\/firestore|lib\/firebase\/client/);
  assert.match(page, /\/api\/admin\/payment-reconciliation/);
  assert.match(route, /requireServerRole\(request, \['admin'\]\)/);
  assert.match(route, /import \{ adminDb \} from '\@\/lib\/firebase\/admin'/);
  assert.doesNotMatch(route, /firebase\/firestore|lib\/firebase\/client/);
  assert.ok(admin.indexOf('resolveFirebaseEmulatorConfiguration({') < admin.indexOf('function initAdmin()'));
  assert.ok(admin.indexOf('process.env.FIRESTORE_EMULATOR_HOST =') < admin.indexOf('export const adminDb'));
});

test('the shared Web SDK initializer binds its actual Firestore instance in both runtimes', () => {
  const client = readFileSync(resolve('src/lib/firebase/client.ts'), 'utf8');
  const connector = readFileSync(resolve('src/lib/firebase/client-emulator.ts'), 'utf8');
  const playwright = readFileSync(resolve('playwright.refunds.config.mjs'), 'utf8');

  assert.match(client, /connectFirestoreEmulator\(db, hostname, Number\(port\)\)/);
  assert.match(client, /connectFirebaseEmulatorServices\([\s\S]*typeof window !== 'undefined'/);
  assert.match(connector, /connectors\.firestore\(configuration\.firestoreHost\);[\s\S]*if \(!isBrowser\) return;/);
  assert.match(playwright, /assertWebFirestoreIsolationWiring\(\)/);
  assert.match(playwright, /FIRESTORE_EMULATOR_HOST: '127\.0\.0\.1:18080'/);
});

test('server-rendered catalogue and sitemap reads use the Admin SDK helper', () => {
  const serverFiles = [
    'src/app/(shop)/page.tsx',
    'src/app/(shop)/categories/page.tsx',
    'src/app/(shop)/categories/[slug]/page.tsx',
    'src/app/sitemap.ts',
  ];
  for (const filename of serverFiles) {
    const source = readFileSync(resolve(filename), 'utf8');
    assert.match(source, /from ['"]@\/lib\/firebase\/server-catalog['"]/);
    assert.doesNotMatch(source, /from ['"]@\/lib\/firebase\/firestore['"]/);
  }
});

