import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const FAKE_LIVE_KEY = "sk_live_FAKEFAKEFAKEFAKEFAKE";
const FAKE_TEST_KEY = "sk_test_FAKEFAKEFAKEFAKEFAKE";

async function loadStripeEnv() {
  return import("../lib/stripe-env");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Stripe key mode detection", () => {
  it("detects live, test, restricted, missing, and unrecognized keys by prefix", async () => {
    const { getStripeKeyMode } = await loadStripeEnv();

    expect(getStripeKeyMode(FAKE_LIVE_KEY)).toBe("live");
    expect(getStripeKeyMode(FAKE_TEST_KEY)).toBe("test");
    expect(getStripeKeyMode("rk_live_FAKE")).toBe("live");
    expect(getStripeKeyMode("rk_test_FAKE")).toBe("test");
    expect(getStripeKeyMode("")).toBe("missing");
    expect(getStripeKeyMode(undefined)).toBe("missing");
    expect(getStripeKeyMode("   ")).toBe("missing");
    // Publishable key pasted into the secret slot, or truncated value.
    expect(getStripeKeyMode("pk_live_FAKE")).toBe("unrecognized");
    expect(getStripeKeyMode("sk_liv")).toBe("unrecognized");
  });
});

describe("runtime environment classification", () => {
  it("prefers VERCEL_ENV over NODE_ENV", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    const { getRuntimeEnvironment } = await loadStripeEnv();
    expect(getRuntimeEnvironment()).toBe("preview");
  });

  it("falls back to NODE_ENV outside Vercel", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    const { getRuntimeEnvironment } = await loadStripeEnv();
    expect(getRuntimeEnvironment()).toBe("production");
  });

  it("classifies anything else as development", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    const { getRuntimeEnvironment } = await loadStripeEnv();
    expect(getRuntimeEnvironment()).toBe("development");
  });
});

describe("Stripe key / environment enforcement", () => {
  it("requires a live key in production", async () => {
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    expect(() => assertStripeKeyAllowedForEnvironment("live", "production")).not.toThrow();
    expect(() => assertStripeKeyAllowedForEnvironment("test", "production")).toThrow(/live STRIPE_SECRET_KEY/);
    expect(() => assertStripeKeyAllowedForEnvironment("missing", "production")).toThrow(/Missing STRIPE_SECRET_KEY/);
  });

  it("refuses a live key in development, preview, and test", async () => {
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    for (const environment of ["development", "preview", "test"] as const) {
      expect(() => assertStripeKeyAllowedForEnvironment("live", environment)).toThrow(/LIVE secret key/);
    }
  });

  it("allows test keys everywhere except production", async () => {
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    for (const environment of ["development", "preview", "test"] as const) {
      expect(() => assertStripeKeyAllowedForEnvironment("test", environment)).not.toThrow();
    }
  });

  it("rejects unrecognized key formats everywhere", async () => {
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    expect(() => assertStripeKeyAllowedForEnvironment("unrecognized", "development")).toThrow(/does not look like/);
    expect(() => assertStripeKeyAllowedForEnvironment("unrecognized", "production")).toThrow(/does not look like/);
  });

  it("allows live in development only with the explicit override, and warns loudly", async () => {
    vi.stubEnv("NEXUS_ALLOW_LIVE_STRIPE_IN_DEV", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    expect(() => assertStripeKeyAllowedForEnvironment("live", "development")).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DANGER"));
    warn.mockRestore();
  });

  it("uses a separate override for preview", async () => {
    vi.stubEnv("NEXUS_ALLOW_LIVE_STRIPE_IN_DEV", "1");
    const { assertStripeKeyAllowedForEnvironment } = await loadStripeEnv();

    // The dev override must not unlock preview.
    expect(() => assertStripeKeyAllowedForEnvironment("live", "preview")).toThrow(/NEXUS_ALLOW_LIVE_STRIPE_IN_PREVIEW/);
  });
});

describe("safe diagnostics", () => {
  it("reports mode, APP_URL, webhook presence, and database host without any secret values", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_TEST_KEY);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_FAKEFAKEFAKE");
    vi.stubEnv("APP_URL", "https://app.nexusrentals.co");
    vi.stubEnv("DATABASE_URL", "postgresql://nexus:super-secret-password@ep-fake-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require");
    const { getStripeEnvDiagnostics } = await loadStripeEnv();

    const diagnostics = getStripeEnvDiagnostics();

    expect(diagnostics.stripeMode).toBe("test");
    expect(diagnostics.webhookConfigured).toBe(true);
    expect(diagnostics.appUrl.host).toBe("app.nexusrentals.co");
    expect(diagnostics.databaseTarget).toBe("ep-fake-pooler.us-east-2.aws.neon.tech");

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain(FAKE_TEST_KEY);
    expect(serialized).not.toContain("whsec_FAKEFAKEFAKE");
    expect(serialized).not.toContain("super-secret-password");
    expect(serialized).not.toContain("nexus:");
  });

  it("labels a missing database URL without throwing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    const { getStripeEnvDiagnostics } = await loadStripeEnv();

    const diagnostics = getStripeEnvDiagnostics();
    expect(diagnostics.stripeMode).toBe("missing");
    expect(diagnostics.webhookConfigured).toBe(false);
    expect(diagnostics.databaseTarget).toBe("missing-or-invalid");
  });
});

describe("database target description", () => {
  it("returns hostname only and flags remote hosts", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user1:secret-pass@ep-prod.neon.tech:5432/neondb?sslmode=require");
    const { describeDatabaseTarget } = await import("../lib/database");

    const target = describeDatabaseTarget();
    expect(target).toEqual({ label: "ep-prod.neon.tech", remote: true });
  });

  it("treats localhost as non-remote", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user1:secret-pass@localhost:5432/nexus");
    const { describeDatabaseTarget } = await import("../lib/database");

    expect(describeDatabaseTarget()).toEqual({ label: "localhost", remote: false });
  });
});
