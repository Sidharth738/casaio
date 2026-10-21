export type RazorpayMode = 'test' | 'live' | 'simulation';

export type RazorpayEnvironment = 'development' | 'test' | 'production';

export type RazorpayConfiguration =
  | { mode: 'simulation' }
  | { mode: 'test' | 'live'; keyId: string; keySecret: string };

export type RazorpayEnvironmentValues = {
  NODE_ENV?: string;
  RAZORPAY_MODE?: string;
  RAZORPAY_LIVE_PAYMENTS_ENABLED?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_KEY_SECRET_MODE?: string;
  RAZORPAY_SIMULATION_ENABLED?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET_MODE?: string;
};

export class RazorpayConfigurationError extends Error {
  constructor(readonly code: string) {
    super('Razorpay configuration is invalid.');
    this.name = 'RazorpayConfigurationError';
  }
}

function clean(value: string | undefined) {
  return value?.trim() || '';
}

function isPlaceholder(value: string) {
  return /placeholder|replace[-_]me|change[-_]me|your[-_]/i.test(value);
}

function isMode(value: string): value is RazorpayMode {
  return value === 'test' || value === 'live' || value === 'simulation';
}

export function resolveRazorpayConfiguration(
  env: RazorpayEnvironmentValues
): RazorpayConfiguration {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new RazorpayConfigurationError('invalid_environment');
  }

  const modeValue = clean(env.RAZORPAY_MODE);
  if (!isMode(modeValue)) throw new RazorpayConfigurationError('invalid_mode');

  const livePaymentsEnabled = env.RAZORPAY_LIVE_PAYMENTS_ENABLED === 'true';
  if (modeValue === 'live') {
    if (nodeEnv !== 'production' || !livePaymentsEnabled) {
      throw new RazorpayConfigurationError('live_not_authorized');
    }
  } else if (livePaymentsEnabled) {
    throw new RazorpayConfigurationError('ambiguous_live_configuration');
  }

  if (modeValue === 'simulation') {
    const hasCredentialValues = Boolean(
      clean(env.RAZORPAY_KEY_ID) || clean(env.RAZORPAY_KEY_SECRET) ||
      clean(env.RAZORPAY_WEBHOOK_SECRET)
    );
    if (nodeEnv === 'production' || env.RAZORPAY_SIMULATION_ENABLED !== 'true' || hasCredentialValues) {
      throw new RazorpayConfigurationError('simulation_not_authorized');
    }
    return { mode: 'simulation' };
  }

  const keyId = clean(env.RAZORPAY_KEY_ID);
  const keySecret = clean(env.RAZORPAY_KEY_SECRET);
  const secretMode = clean(env.RAZORPAY_KEY_SECRET_MODE);
  if (!keyId || !keySecret || isPlaceholder(keyId) || isPlaceholder(keySecret)) {
    throw new RazorpayConfigurationError('missing_credentials');
  }

  const expectedPrefix = modeValue === 'test' ? 'rzp_test_' : 'rzp_live_';
  if (!keyId.startsWith(expectedPrefix) || secretMode !== modeValue) {
    throw new RazorpayConfigurationError('credential_mode_mismatch');
  }

  return { mode: modeValue, keyId, keySecret };
}

export function resolveRazorpayWebhookSecret(env: RazorpayEnvironmentValues) {
  const configuration = resolveRazorpayConfiguration(env);
  if (configuration.mode === 'simulation') {
    throw new RazorpayConfigurationError('webhook_unavailable_in_simulation');
  }

  const webhookSecret = clean(env.RAZORPAY_WEBHOOK_SECRET);
  if (!webhookSecret || isPlaceholder(webhookSecret) ||
      clean(env.RAZORPAY_WEBHOOK_SECRET_MODE) !== configuration.mode) {
    throw new RazorpayConfigurationError('webhook_configuration_invalid');
  }

  return { mode: configuration.mode, secret: webhookSecret } as const;
}
