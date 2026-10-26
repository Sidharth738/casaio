import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';

const requiredEnvironment = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  GCLOUD_PROJECT: 'demo-casaio-rules',
  GOOGLE_CLOUD_PROJECT: 'demo-casaio-rules',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
};

for (const [name, expected] of Object.entries(requiredEnvironment)) {
  if (process.env[name] !== expected) {
    throw new Error(`Firebase Web Firestore emulator test requires ${name}=${expected}.`);
  }
}

const [{ db, default: firebaseApp }, { adminApp, adminDb }] = await Promise.all([
  import('@/lib/firebase/client'),
  import('@/lib/firebase/admin'),
]);
const require = createRequire(import.meta.url);
const { doc, getDoc, terminate } = require('firebase/firestore');

after(async () => {
  await terminate(db);
});

function assertLoopbackEmulatorAvailable() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 18080 });
    socket.setTimeout(2000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('The required loopback Firestore Emulator did not respond.'));
    });
    socket.once('error', () => reject(new Error('The required loopback Firestore Emulator is unavailable.')));
  });
}

test('the initialized server Web Firestore instance is pinned to the loopback Emulator', () => {
  // Firebase's Node Web SDK exposes this internal settings accessor; use it
  // here to verify the concrete instance created by client.ts without making
  // any Firestore request.
  const settings = db._getSettings();
  assert.equal(settings.host, '127.0.0.1:18080');
  assert.equal(settings.ssl, false);
  assert.equal(firebaseApp.options.projectId, 'demo-casaio-rules');
  assert.equal(adminApp.options.projectId, 'demo-casaio-rules');
});

test('a server Web SDK read reaches only a synthetic document on the local Emulator', async () => {
  await assertLoopbackEmulatorAvailable();
  const fixtureId = `web-firestore-emulator-${randomUUID()}`;
  const fixtureRef = adminDb.collection('categories').doc(fixtureId);

  await fixtureRef.create({
    name: 'Synthetic Web SDK isolation fixture',
    slug: fixtureId,
    isActive: true,
    sortOrder: 1,
  });

  try {
    const snapshot = await getDoc(doc(db, 'categories', fixtureId));
    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.data()?.slug, fixtureId);
  } finally {
    await fixtureRef.delete();
  }
});
