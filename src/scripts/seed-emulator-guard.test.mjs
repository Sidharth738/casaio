import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeSeedEnvironment } from './seed-emulator-guard.ts';

const demoProject = { FIREBASE_PROJECT_ID: 'demo-casaio-rules' };

test('seed guard accepts the explicit demo project and canonical emulator endpoint', () => {
  assert.doesNotThrow(() => assertSafeSeedEnvironment({
    ...demoProject,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  }));
});

test('seed guard accepts explicitly supported loopback aliases on the same port', () => {
  for (const host of ['localhost:18080', '[::1]:18080']) {
    assert.doesNotThrow(() => assertSafeSeedEnvironment({
      ...demoProject,
      FIRESTORE_EMULATOR_HOST: host,
    }));
  }
});

test('seed guard rejects missing and non-demo project IDs', () => {
  assert.throws(() => assertSafeSeedEnvironment({
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  }), /explicit demo-casaio-rules project ID/);

  assert.throws(() => assertSafeSeedEnvironment({
    FIREBASE_PROJECT_ID: 'production-project',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  }), /explicit demo-casaio-rules project ID/);

  assert.throws(() => assertSafeSeedEnvironment({
    FIREBASE_PROJECT_ID: 'demo-casaio-rules',
    GOOGLE_CLOUD_PROJECT: 'production-project',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  }), /explicit demo-casaio-rules project ID/);
});

test('seed guard rejects a missing emulator host and non-loopback endpoints', () => {
  assert.throws(() => assertSafeSeedEnvironment(demoProject), /Firestore Emulator/);

  for (const host of ['firestore.googleapis.com:443', '192.168.1.10:18080', '127.0.0.1:8080']) {
    assert.throws(() => assertSafeSeedEnvironment({
      ...demoProject,
      FIRESTORE_EMULATOR_HOST: host,
    }), /Firestore Emulator/);
  }
});
