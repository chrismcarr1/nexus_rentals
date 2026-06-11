import "server-only";

import Stripe from "stripe";

import {
  assertStripeKeyAllowedForEnvironment,
  getRuntimeEnvironment,
  getStripeKeyMode,
  logStripeEnvDiagnosticsOnce
} from "@/lib/stripe-env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY.");
  if (!stripeClient) {
    const mode = getStripeKeyMode(secretKey);
    // Throws when the key mode is not allowed in this environment (e.g. a live
    // key during local development). Logs derived facts only, never the key.
    assertStripeKeyAllowedForEnvironment(mode);
    console.log("[stripe] Initializing Stripe client", { mode, environment: getRuntimeEnvironment() });
    logStripeEnvDiagnosticsOnce();
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

let warnedWebhookSecretShape = false;

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  if (!secret.startsWith("whsec_") && !warnedWebhookSecretShape) {
    warnedWebhookSecretShape = true;
    console.warn(
      "[stripe-env] STRIPE_WEBHOOK_SECRET does not start with whsec_. Signature verification will fail if this " +
        "is not the signing secret for this environment's webhook endpoint."
    );
  }
  return secret;
}

// Platform fee charged to the tenant on top of rent. Landlord receives the full rent amount.
export function getPlatformFeeCents(): number {
  const val = Number(process.env.NEXUS_PLATFORM_FEE_CENTS ?? "100");
  return Number.isFinite(val) && val >= 0 ? Math.round(val) : 100;
}
