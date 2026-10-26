import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { loadEnvConfig } = require('@next/env');
const ts = require('typescript');

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
loadEnvConfig(projectRoot, true, { info() {}, error() {} }, true);

async function loadTypeScriptCore(relativePath) {
  const source = readFileSync(resolve(projectRoot, relativePath), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  if (diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error('validator_unavailable');
  }

  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  return import(moduleUrl);
}

const status = new Map();
const record = (name, passed) => status.set(name, passed ? 'PASS' : 'FAIL');
const equal = (name, expected) => record(name, process.env[name] === expected);
const nonEmpty = (label, envName) => record(label, Boolean(process.env[envName]?.trim()));

const firebaseExpected = {
  NEXT_PUBLIC_CASAIO_FIREBASE_EMULATORS: 'true',
  FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-casaio-rules',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  FIREBASE_AUTH_EMULATOR_HOST: 'http://127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199',
};

record('nodeEnvironmentDevelopment', process.env.NODE_ENV === 'development');
for (const [name, expected] of Object.entries(firebaseExpected)) equal(name, expected);
for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
  record(name, !process.env[name]?.trim() || process.env[name] === 'demo-casaio-rules');
}

try {
  const { resolveFirebaseEmulatorConfiguration } = await loadTypeScriptCore(
    'src/lib/firebase/emulator-config-core.ts',
  );
  const firebase = resolveFirebaseEmulatorConfiguration(process.env);
  record(
    'firebaseValidatorPinsDemoLoopback',
    firebase.enabled === true &&
      firebase.projectId === 'demo-casaio-rules' &&
      firebase.authHost === '127.0.0.1:9099' &&
      firebase.firestoreHost === '127.0.0.1:18080' &&
      firebase.storageHost === '127.0.0.1:9199',
  );
} catch {
  record('firebaseValidatorPinsDemoLoopback', false);
}

equal('RAZORPAY_MODE_test', 'test');
equal('RAZORPAY_LIVE_PAYMENTS_ENABLED_false', 'false');
equal('RAZORPAY_SIMULATION_ENABLED_false', 'false');
record('RAZORPAY_KEY_ID_testPrefix', process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') === true);
nonEmpty('RAZORPAY_KEY_SECRET_present', 'RAZORPAY_KEY_SECRET');
equal('RAZORPAY_KEY_SECRET_MODE_test', 'test');
nonEmpty('RAZORPAY_WEBHOOK_SECRET_present', 'RAZORPAY_WEBHOOK_SECRET');
equal('RAZORPAY_WEBHOOK_SECRET_MODE_test', 'test');

try {
  const {
    resolveRazorpayConfiguration,
    resolveRazorpayWebhookSecret,
  } = await loadTypeScriptCore('src/lib/payment/razorpay-config-core.ts');
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    RAZORPAY_MODE: process.env.RAZORPAY_MODE,
    RAZORPAY_LIVE_PAYMENTS_ENABLED: process.env.RAZORPAY_LIVE_PAYMENTS_ENABLED,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_KEY_SECRET_MODE: process.env.RAZORPAY_KEY_SECRET_MODE,
    RAZORPAY_SIMULATION_ENABLED: process.env.RAZORPAY_SIMULATION_ENABLED,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    RAZORPAY_WEBHOOK_SECRET_MODE: process.env.RAZORPAY_WEBHOOK_SECRET_MODE,
  };
  const configuration = resolveRazorpayConfiguration(env);
  record('razorpayValidatorAcceptsTestConfiguration', configuration.mode === 'test');
  const webhook = resolveRazorpayWebhookSecret(env);
  record('razorpayWebhookValidatorAcceptsTestConfiguration', webhook.mode === 'test');
} catch {
  record('razorpayValidatorAcceptsTestConfiguration', false);
  record('razorpayWebhookValidatorAcceptsTestConfiguration', false);
}

for (const [name, result] of status) process.stdout.write(`${name}: ${result}\n`);
const passed = [...status.values()].every((result) => result === 'PASS');
process.stdout.write(`localConfiguration: ${passed ? 'PASS' : 'FAIL'}\n`);
if (!passed) process.exitCode = 1;
