import "server-only";

import Stripe from "stripe";

export const NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS = 100;

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  return webhookSecret;
}
