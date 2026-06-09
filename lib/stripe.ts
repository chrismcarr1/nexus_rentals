import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY.");
  if (!stripeClient) {
    console.log("[stripe] Initializing Stripe client", { mode: secretKey.startsWith("sk_live") ? "live" : "test" });
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  return secret;
}

// Platform fee charged to the tenant on top of rent. Landlord receives the full rent amount.
export function getPlatformFeeCents(): number {
  const val = Number(process.env.NEXUS_PLATFORM_FEE_CENTS ?? "100");
  return Number.isFinite(val) && val >= 0 ? Math.round(val) : 100;
}
