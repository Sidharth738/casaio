import {
  LOCAL_FIREBASE_EMULATOR_ENDPOINTS,
  type FirebaseEmulatorConfiguration,
} from './emulator-config-core';

type EmulatorConnectors = {
  firestore: (host: string) => void;
  auth: (host: string) => void;
  storage: (host: string) => void;
};

/**
 * Bind the Web SDK's Firestore instance in both runtimes when emulator mode is
 * explicit. Client-only services remain browser-only. This protects SSR and
 * server-side helpers that still import the shared client module from ever
 * falling through to Google's default Firestore endpoint.
 */
export function connectFirebaseEmulatorServices(
  configuration: FirebaseEmulatorConfiguration,
  connectors: EmulatorConnectors,
  connections: Set<string>,
  isBrowser: boolean,
): void {
  if (!configuration.enabled) return;

  if (configuration.projectId !== 'demo-casaio-rules' ||
      configuration.firestoreHost !== LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore ||
      configuration.authHost !== LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth ||
      configuration.storageHost !== LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage) {
    throw new Error('Firebase Web SDK emulator configuration is not loopback-bound.');
  }

  // Firestore is safe to bind during server rendering too. Any server-side
  // Web SDK operation is now pinned to loopback before db is exported/used.
  if (!connections.has('firestore')) {
    connectors.firestore(configuration.firestoreHost);
    connections.add('firestore');
  }

  if (!isBrowser) return;

  if (!connections.has('auth')) {
    connectors.auth(configuration.authHost);
    connections.add('auth');
  }
  if (!connections.has('storage')) {
    connectors.storage(configuration.storageHost);
    connections.add('storage');
  }
}
