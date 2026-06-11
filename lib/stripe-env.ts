import "server-only";

import { describeDatabaseTarget } from "@/lib/database";
import { getAppUrlDiagnostics } from "@/lib/request-origin";

// Environment-safety guard rails for Stripe configuration.
//
// Everything in this module reports derived facts only — key mode from the
// prefix, hostnames, booleans. No function here may ever return, log, or embed
// a raw secret value.

export type StripeKeyMode = "live" | "test" | "missing" | "unrecognized";
export type RuntimeEnvironment = "production" | "preview" | "development" | "test";

// Vercel distinguishes production from preview via VERCEL_ENV; NODE_ENV alone
// reports "production" for both. Non-Vercel production hosting falls back to
// NODE_ENV. Anything that is not production/preview/test counts as development.
export function getRuntimeEnvironment(): RuntimeEnvironment {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export function getStripeKeyMode(secretKey: string | undefined = process.env.STRIPE_SECRET_KEY): StripeKeyMode {
  const key = secretKey?.trim();
  if (!key) return "missing";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "unrecognized";
}

let warnedLiveOverride = false;

// Hard gate evaluated before the Stripe client is created:
// - production must use a live key (a test key would record fake rent as paid)
// - development/preview/test must use a test key, because a live key would
//   create real charges and real payouts from a non-production environment.
//   Deliberate live-mode use requires the explicit per-environment override.
export function assertStripeKeyAllowedForEnvironment(
  mode: StripeKeyMode = getStripeKeyMode(),
  environment: RuntimeEnvironment = getRuntimeEnvironment()
) {
  if (mode === "missing") {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  if (mode === "unrecognized") {
    throw new Error(
      "STRIPE_SECRET_KEY does not look like a Stripe secret key (expected an sk_live_/sk_test_ prefix). " +
        "Check for truncation or for a publishable key pasted into the secret key slot."
    );
  }

  if (environment === "production") {
    if (mode !== "live") {
      throw new Error(
        "Production requires a live STRIPE_SECRET_KEY (sk_live_...). A test key here would send tenants " +
          "through test checkout and mark real rent charges as paid without moving money."
      );
    }
    return;
  }

  if (mode === "live") {
    const overrideVar =
      environment === "preview" ? "NEXUS_ALLOW_LIVE_STRIPE_IN_PREVIEW" : "NEXUS_ALLOW_LIVE_STRIPE_IN_DEV";
    if (process.env[overrideVar] === "1") {
      if (!warnedLiveOverride) {
        warnedLiveOverride = true;
        console.warn(
          `[stripe-env] DANGER: using a LIVE Stripe key in the ${environment} environment because ` +
            `${overrideVar}=1. Checkout sessions created here WILL charge real cards and pay out real money.`
        );
      }
      return;
    }
    throw new Error(
      `Refusing to initialize Stripe with a LIVE secret key in the ${environment} environment: checkout here ` +
        `would create real charges and payouts. Use a test key (sk_test_...), or set ${overrideVar}=1 only if ` +
        `you are intentionally exercising live mode from this environment.`
    );
  }
}

export type StripeEnvDiagnostics = {
  environment: RuntimeEnvironment;
  stripeMode: StripeKeyMode;
  webhookConfigured: boolean;
  appUrl: { present: boolean; valid: boolean; host: string | null; issue: string | null };
  // Hostname only — never the connection string (which embeds credentials).
  databaseTarget: string;
};

export function getStripeEnvDiagnostics(): StripeEnvDiagnostics {
  const appUrl = getAppUrlDiagnostics();
  return {
    environment: getRuntimeEnvironment(),
    stripeMode: getStripeKeyMode(),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    appUrl: { present: appUrl.present, valid: appUrl.valid, host: appUrl.host, issue: appUrl.issue },
    databaseTarget: describeDatabaseTarget().label
  };
}

let loggedDiagnostics = false;

// One-time startup log of the safe diagnostic snapshot, emitted when the
// Stripe client first initializes in a process.
export function logStripeEnvDiagnosticsOnce() {
  if (loggedDiagnostics) return;
  loggedDiagnostics = true;
  console.log("[stripe-env] Environment diagnostics", getStripeEnvDiagnostics());
}
