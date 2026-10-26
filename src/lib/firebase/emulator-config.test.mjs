import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LOCAL_FIREBASE_EMULATOR_ENDPOINTS,
  LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
  resolveFirebaseEmulatorConfiguration,
} from '@/lib/firebase/emulator-config-core';

const localEnvironment = {
  NODE_ENV: 'development',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
};

test('checked-in Firebase emulator ports match the local SDK endpoints', () => {
  const firebaseConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'firebase.json'), 'utf8'));
  const packageConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

  assert.equal(firebaseConfig.emulators.auth.port, 9099);
  assert.equal(firebaseConfig.emulators.firestore.port, 18080);
  assert.equal(firebaseConfig.emulators.firestore.websocketPort, 19150);
  assert.equal(firebaseConfig.emulators.storage.port, 9199);
  assert.equal(firebaseConfig.emulators.hub.port, 14400);
  assert.match(packageConfig.scripts['test:rules'], /--project demo-casaio-rules/);
});

test('local emulator mode pins Auth, Firestore, and Storage to loopback demo endpoints', () => {
  assert.deepEqual(resolveFirebaseEmulatorConfiguration(localEnvironment), {
    enabled: true,
    projectId: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
    authHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth,
    firestoreHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore,
    storageHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage,
  });
});

test('the emulator flag is opt-in and leaves ordinary configuration unchanged', () => {
  assert.deepEqual(resolveFirebaseEmulatorConfiguration({
    NODE_ENV: 'production',
    FIREBASE_PROJECT_ID: 'production-project',
  }), { enabled: false });
});

test('emulator mode rejects production runtime and non-demo project IDs', () => {
  assert.throws(() => resolveFirebaseEmulatorConfiguration({
    ...localEnvironment,
    NODE_ENV: 'production',
  }), /cannot be enabled in production/);

  for (const key of ['FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    assert.throws(() => resolveFirebaseEmulatorConfiguration({
      ...localEnvironment,
      [key]: 'production-project',
    }), /explicit demo project ID/);
  }
});

test('emulator mode rejects non-loopback and mismatched service endpoints', () => {
  for (const key of [
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'STORAGE_EMULATOR_HOST',
  ]) {
    assert.throws(() => resolveFirebaseEmulatorConfiguration({
      ...localEnvironment,
      [key]: 'production.example.com:443',
    }), /loopback endpoints/);
  }
});
