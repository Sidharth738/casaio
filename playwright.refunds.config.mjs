import { createServer, createConnection } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, defineConfig } from '@playwright/test';

const projectId = 'demo-casaio-rules';
const emulatorHosts = {
  auth: ['127.0.0.1', 9099],
  firestore: ['127.0.0.1', 18080],
  firestoreWebSocket: ['127.0.0.1', 19150],
  storage: ['127.0.0.1', 9199],
};
const appHost = '127.0.0.1';
const appPort = 3010;
const isPlaywrightWorker = process.env.TEST_WORKER_INDEX !== undefined;

function assertSafeInheritedConfiguration() {
  if (process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE === 'live' ||
      process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED === 'true') {
    throw new Error('Refund browser tests refuse production or live-payment process configuration.');
  }

  const inheritedProjects = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
  ].filter(Boolean);
  if (inheritedProjects.some((value) => value !== projectId)) {
    throw new Error('Refund browser tests require the explicit demo Firebase project.');
  }

  const expectedHosts = new Map([
    ['FIRESTORE_EMULATOR_HOST', '127.0.0.1:18080'],
    ['FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099'],
    ['FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9199'],
    ['STORAGE_EMULATOR_HOST', 'http://127.0.0.1:9199'],
  ]);
  for (const [name, expected] of expectedHosts) {
    if (process.env[name] && process.env[name] !== expected) {
      throw new Error('Refund browser tests refuse a non-loopback Firebase emulator endpoint.');
    }
  }
}

function assertPortAvailable(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Required local test port ${port} is already occupied.`)));
    server.listen(port, host, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function assertLoopbackEndpoint(host, port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(2500);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Required local emulator port ${port} did not respond.`));
    });
    socket.once('error', () => reject(new Error(`Required local emulator port ${port} is unavailable.`)));
  });
}

assertSafeInheritedConfiguration();

// Empty sensitive inputs in this test process before Next can load dotenv files.
// The app's emulator-mode Admin SDK uses its synthetic local credential instead.
for (const name of [
  'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_CONFIG', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_LIVE_KEY_ID', 'RAZORPAY_LIVE_KEY_SECRET',
  'RAZORPAY_LIVE_WEBHOOK_SECRET', 'RAZORPAY_KEY_SECRET_MODE', 'RAZORPAY_WEBHOOK_SECRET_MODE',
]) process.env[name] = '';

const safeFirebaseEnvironment = {
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:casaio-emulator',
  NODE_ENV: 'development',
  CASAIO_PLAYWRIGHT_TEST: 'true',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve('tests/browser/next-font-mocks.cjs'),
  NEXT_TELEMETRY_DISABLED: '1',
  RAZORPAY_MODE: 'test',
  RAZORPAY_LIVE_PAYMENTS_ENABLED: 'false',
  RAZORPAY_SIMULATION_ENABLED: 'false',
  PORT: String(appPort),
  HOSTNAME: appHost,
  GOOGLE_APPLICATION_CREDENTIALS: '',
  FIREBASE_CONFIG: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  FIREBASE_SERVICE_ACCOUNT: '',
  FIREBASE_SERVICE_ACCOUNT_KEY: '',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: '',
  RAZORPAY_LIVE_KEY_ID: '',
  RAZORPAY_LIVE_KEY_SECRET: '',
  RAZORPAY_LIVE_WEBHOOK_SECRET: '',
  RAZORPAY_KEY_SECRET_MODE: '',
  RAZORPAY_WEBHOOK_SECRET_MODE: '',
  PATH: process.env.PATH || '',
  SystemRoot: process.env.SystemRoot || '',
  SYSTEMROOT: process.env.SYSTEMROOT || '',
  WINDIR: process.env.WINDIR || '',
  TEMP: process.env.TEMP || '',
  TMP: process.env.TMP || '',
  USERPROFILE: process.env.USERPROFILE || '',
  APPDATA: process.env.APPDATA || '',
  LOCALAPPDATA: process.env.LOCALAPPDATA || '',
};

Object.assign(process.env, safeFirebaseEnvironment);

function assertWebFirestoreIsolationWiring() {
  if (safeFirebaseEnvironment.NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS !== 'true' ||
      safeFirebaseEnvironment.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId ||
      safeFirebaseEnvironment.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18080') {
    throw new Error('Refund browser tests require the explicit loopback demo Firestore configuration.');
  }

  const clientSource = readFileSync(resolve('src/lib/firebase/client.ts'), 'utf8');
  const connectorSource = readFileSync(resolve('src/lib/firebase/client-emulator.ts'), 'utf8');
  const firestoreConnection = connectorSource.indexOf('connectors.firestore(configuration.firestoreHost);');
  const browserOnlyGuard = connectorSource.indexOf('if (!isBrowser) return;');
  if (!clientSource.includes('connectFirebaseEmulatorServices(') ||
      !connectorSource.includes('connectors.firestore(configuration.firestoreHost);') ||
      firestoreConnection < 0 || browserOnlyGuard < 0 || firestoreConnection > browserOnlyGuard) {
    throw new Error('Refund browser tests refuse an unverified server Web Firestore emulator binding.');
  }
}

assertWebFirestoreIsolationWiring();

if (!isPlaywrightWorker) {
  await Promise.all(Object.values(emulatorHosts).map(([host, port]) => assertLoopbackEndpoint(host, port)));
  await assertPortAvailable(appHost, appPort);

  const authHealth = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/config`);
  if (!authHealth.ok) throw new Error('Auth Emulator project preflight failed.');
  const firestoreHealth = await fetch('http://127.0.0.1:18080/');
  if (!firestoreHealth.ok) throw new Error('Firestore Emulator preflight failed.');

  // Verify Edge can launch before any fixture is created. No browser download occurs.
  const edge = await chromium.launch({ channel: 'msedge', headless: true });
  await edge.close();
}

const systemEnv = Object.fromEntries(Object.entries(safeFirebaseEnvironment));

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'admin-refunds.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '.next/playwright/test-results',
  use: {
    baseURL: `http://${appHost}:${appPort}`,
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: `"${process.execPath}" "${resolve('node_modules/next/dist/bin/next')}" dev --turbopack --hostname 127.0.0.1 --port 3010`,
    url: `http://${appHost}:${appPort}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: systemEnv,
  },
});
