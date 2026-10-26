import { getApps, getApp, initializeApp, cert, App, type Credential } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { generateKeyPairSync } from 'node:crypto';
import { resolveFirebaseEmulatorConfiguration } from './emulator-config-core';

const firebaseEmulatorConfiguration = resolveFirebaseEmulatorConfiguration({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  STORAGE_EMULATOR_HOST: process.env.STORAGE_EMULATOR_HOST,
});

if (firebaseEmulatorConfiguration.enabled) {
  // Force all server Firebase SDKs to the fixed loopback demo project before
  // any service is created. Never use a service account or ADC in this mode.
  process.env.FIREBASE_PROJECT_ID = firebaseEmulatorConfiguration.projectId;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = firebaseEmulatorConfiguration.projectId;
  process.env.GCLOUD_PROJECT = firebaseEmulatorConfiguration.projectId;
  process.env.GOOGLE_CLOUD_PROJECT = firebaseEmulatorConfiguration.projectId;
  process.env.FIRESTORE_EMULATOR_HOST = firebaseEmulatorConfiguration.firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = firebaseEmulatorConfiguration.authHost;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = firebaseEmulatorConfiguration.storageHost;
  process.env.STORAGE_EMULATOR_HOST = `http://${firebaseEmulatorConfiguration.storageHost}`;
}

// Firestore's Admin adapter accepts only its service-account or ADC credential
// implementations. Use an ephemeral synthetic service account in local mode;
// emulator endpoints are pinned above, and this identity has no real project.
function createLocalEmulatorCredential(): Credential {
  return cert({
    projectId: 'demo-casaio-rules',
    clientEmail: 'casaio-emulator@demo-casaio-rules.invalid',
    privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  });
}

function initAdmin(): App {
  if (getApps().length > 0) {
    const app = getApp();
    if (firebaseEmulatorConfiguration.enabled && app.options.projectId !== firebaseEmulatorConfiguration.projectId) {
      throw new Error('Firebase Admin app was initialized for a different project before emulator mode.');
    }
    return app;
  }

  if (firebaseEmulatorConfiguration.enabled) {
    return initializeApp({
      projectId: firebaseEmulatorConfiguration.projectId,
      storageBucket: `${firebaseEmulatorConfiguration.projectId}.appspot.com`,
      credential: createLocalEmulatorCredential(),
    });
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'casaio-app';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  }

  // Graceful fallback for build phase or environments with ADC
  try {
    return initializeApp({
      projectId,
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  } catch {
    console.warn('Firebase Admin initialized with fallback options');
    return initializeApp({ projectId }, 'fallback-app');
  }
}

export const adminApp: App = initAdmin();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
export const adminStorage: Storage = getStorage(adminApp);

export default adminApp;
