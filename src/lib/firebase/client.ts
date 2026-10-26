import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, FirebaseStorage } from 'firebase/storage';
import {
  resolveFirebaseEmulatorConfiguration,
  type FirebaseEmulatorEnvironment,
} from './emulator-config-core';
import { connectFirebaseEmulatorServices } from './client-emulator';

const firebaseEmulatorConfiguration = resolveFirebaseEmulatorConfiguration({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
} satisfies FirebaseEmulatorEnvironment);
export const isFirebaseEmulatorMode = firebaseEmulatorConfiguration.enabled;

const defaultFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyFakeDevApiKeyForCasaioApp12345',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'casaio-app.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'casaio-app',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'casaio-app.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '109876543210',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:109876543210:web:abcdef1234567890',
};
const emulatorFirebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-casaio-rules.firebaseapp.com',
  projectId: 'demo-casaio-rules',
  storageBucket: 'demo-casaio-rules.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:casaio-emulator',
};
const firebaseConfig = firebaseEmulatorConfiguration.enabled ? emulatorFirebaseConfig : defaultFirebaseConfig;

// Initialize Firebase App safely (singleton pattern)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
if (firebaseEmulatorConfiguration.enabled && app.options.projectId !== firebaseEmulatorConfiguration.projectId) {
  throw new Error('Firebase app was initialized for a different project before emulator mode.');
}

// Initialize services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

if (firebaseEmulatorConfiguration.enabled) {
  const emulatorGlobal = globalThis as typeof globalThis & {
    __casaioFirebaseEmulatorConnections?: Set<string>;
  };
  emulatorGlobal.__casaioFirebaseEmulatorConnections ??= new Set<string>();
  connectFirebaseEmulatorServices(
    firebaseEmulatorConfiguration,
    {
      firestore: (host) => {
        const [hostname, port] = host.split(':');
        connectFirestoreEmulator(db, hostname, Number(port));
      },
      auth: (host) => connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true }),
      storage: (host) => {
        const [hostname, port] = host.split(':');
        connectStorageEmulator(storage, hostname, Number(port));
      },
    },
    emulatorGlobal.__casaioFirebaseEmulatorConnections,
    typeof window !== 'undefined',
  );
}

export default app;
