export const SEED_EMULATOR_PROJECT_ID = 'demo-casaio-rules';

export type SeedEnvironment = Record<string, string | undefined>;

const PROJECT_ENV_KEYS = [
  'FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
] as const;

const ALLOWED_FIRESTORE_HOSTS = new Set([
  '127.0.0.1:18080',
  'localhost:18080',
  '[::1]:18080',
]);

export function assertSafeSeedEnvironment(env: SeedEnvironment): void {
  const configuredProjectIds = PROJECT_ENV_KEYS
    .map((key) => env[key]?.trim())
    .filter((value): value is string => Boolean(value));

  if (
    configuredProjectIds.length === 0 ||
    configuredProjectIds.some((projectId) => projectId !== SEED_EMULATOR_PROJECT_ID)
  ) {
    throw new Error('Seeding requires an explicit demo-casaio-rules project ID in the environment.');
  }

  const emulatorHost = env.FIRESTORE_EMULATOR_HOST?.trim();
  if (!emulatorHost || !ALLOWED_FIRESTORE_HOSTS.has(emulatorHost)) {
    throw new Error('Seeding requires Firestore Emulator on a supported loopback host at port 18080.');
  }
}
