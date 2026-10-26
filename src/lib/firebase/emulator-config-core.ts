export const LOCAL_FIREBASE_EMULATOR_PROJECT_ID = 'demo-casaio-rules';
export const LOCAL_FIREBASE_EMULATOR_ENDPOINTS = Object.freeze({
  auth: '127.0.0.1:9099',
  firestore: '127.0.0.1:18080',
  storage: '127.0.0.1:9199',
});

export type FirebaseEmulatorEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS?: string;
  FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  GCLOUD_PROJECT?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  FIREBASE_STORAGE_EMULATOR_HOST?: string;
  STORAGE_EMULATOR_HOST?: string;
};

export type FirebaseEmulatorConfiguration = {
  enabled: false;
} | {
  enabled: true;
  projectId: typeof LOCAL_FIREBASE_EMULATOR_PROJECT_ID;
  authHost: typeof LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth;
  firestoreHost: typeof LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore;
  storageHost: typeof LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage;
};

function configured(value: string | undefined) {
  return value?.trim() || undefined;
}

export function resolveFirebaseEmulatorConfiguration(
  env: FirebaseEmulatorEnvironment,
): FirebaseEmulatorConfiguration {
  if (env.NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS !== 'true') return { enabled: false };

  if (env.NODE_ENV === 'production') {
    throw new Error('Local Firebase emulators cannot be enabled in production.');
  }

  const projectIds = [
    env.FIREBASE_PROJECT_ID,
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    env.GCLOUD_PROJECT,
    env.GOOGLE_CLOUD_PROJECT,
  ].map(configured).filter((value): value is string => Boolean(value));
  if (projectIds.some((projectId) => projectId !== LOCAL_FIREBASE_EMULATOR_PROJECT_ID)) {
    throw new Error('Local Firebase emulator mode requires the explicit demo project ID.');
  }

  const expectedHosts = [
    [env.FIRESTORE_EMULATOR_HOST, LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore],
    [env.FIREBASE_AUTH_EMULATOR_HOST, LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth],
    [env.FIREBASE_STORAGE_EMULATOR_HOST, LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage],
    [env.STORAGE_EMULATOR_HOST, `http://${LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage}`],
  ] as const;
  if (expectedHosts.some(([actual, expected]) => configured(actual) && configured(actual) !== expected)) {
    throw new Error('Local Firebase emulator mode only allows the configured loopback endpoints.');
  }

  return {
    enabled: true,
    projectId: LOCAL_FIREBASE_EMULATOR_PROJECT_ID,
    authHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.auth,
    firestoreHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.firestore,
    storageHost: LOCAL_FIREBASE_EMULATOR_ENDPOINTS.storage,
  };
}
