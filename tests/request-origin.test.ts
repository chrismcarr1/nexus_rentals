import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnv = { ...process.env };

describe("canonical APP_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("normalizes the configured public origin and builds encoded app links", async () => {
    process.env.APP_URL = "https://app.nexusrentals.co/";

    const { buildAppUrl, getAppBaseUrl, getAppUrlDiagnostics } = await import("../lib/request-origin");

    expect(getAppBaseUrl()).toBe("https://app.nexusrentals.co");
    expect(buildAppUrl("/reset-password", { token: "token with spaces" })).toBe(
      "https://app.nexusrentals.co/reset-password?token=token+with+spaces"
    );
    expect(getAppUrlDiagnostics()).toMatchObject({
      present: true,
      valid: true,
      host: "app.nexusrentals.co"
    });
  });

  it("throws a clear error when APP_URL is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "nexus-rentals.vercel.app";

    const { getAppBaseUrl } = await import("../lib/request-origin");

    expect(() => getAppBaseUrl()).toThrow("APP_URL is missing");
  });

  it.each([
    ["http://localhost:3000", "localhost"],
    ["https://nexus-rentals-git-feature.vercel.app", "vercel.app"],
    ["http://app.nexusrentals.co", "https://"]
  ])("rejects unsafe production APP_URL value %s", async (appUrl, expectedMessage) => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_URL = appUrl;

    const { getAppBaseUrl } = await import("../lib/request-origin");

    expect(() => getAppBaseUrl()).toThrow(expectedMessage);
  });

  it("keeps local development working when APP_URL is omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.APP_URL;

    const { getAppBaseUrl } = await import("../lib/request-origin");

    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });
});
