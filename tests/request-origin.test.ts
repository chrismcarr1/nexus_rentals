import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers())
}));

const originalEnv = { ...process.env };

describe("getAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("ignores localhost and placeholder origins in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "https://your-vercel-domain.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "nexus-rentals.vercel.app";

    const { getAppOrigin } = await import("../lib/request-origin");

    await expect(getAppOrigin()).resolves.toBe("https://nexus-rentals.vercel.app");
  });
});
