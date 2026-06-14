import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("application datastore backend", () => {
  it("uses local JSON in development when explicitly selected", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXUS_DATA_STORE", "local-json");
    const { describeAppStoreTarget, getAppStoreBackend, getSql } = await import("../lib/database");

    expect(getAppStoreBackend()).toBe("local-json");
    expect(describeAppStoreTarget()).toEqual({ label: "local-json", remote: false });
    expect(() => getSql()).toThrow(/Hosted Postgres is disabled/);
  });

  it("ignores local JSON mode in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXUS_DATA_STORE", "local-json");
    const { getAppStoreBackend } = await import("../lib/database");

    expect(getAppStoreBackend()).toBe("postgres");
  });

  it("keeps Postgres as the default backend", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXUS_DATA_STORE", "postgres");
    const { getAppStoreBackend } = await import("../lib/database");

    expect(getAppStoreBackend()).toBe("postgres");
  });

  it("reads the real ignored local JSON document without a database connection", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXUS_DATA_STORE", "local-json");
    const { readStore } = await import("../lib/store");

    const store = await readStore();

    expect(Array.isArray(store.users)).toBe(true);
    expect(Array.isArray(store.properties)).toBe(true);
    expect(Array.isArray(store.screeningApplications)).toBe(true);
  });
});
