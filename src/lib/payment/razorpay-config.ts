import 'server-only';

import {
  resolveRazorpayConfiguration,
  resolveRazorpayWebhookSecret,
  type RazorpayConfiguration,
  type RazorpayEnvironmentValues,
} from './razorpay-config-core';

function getEnvironmentValues(): RazorpayEnvironmentValues {
  return {
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
}

export function getRazorpayConfiguration(): RazorpayConfiguration {
  return resolveRazorpayConfiguration(getEnvironmentValues());
}

export function getRazorpayWebhookConfiguration() {
  return resolveRazorpayWebhookSecret(getEnvironmentValues());
}
