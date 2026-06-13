import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/listings-feed-auth is server-only; stub the guard so it imports in tests.
vi.mock("server-only", () => ({}));

let auth: typeof import("@/lib/listings-feed-auth");
const originalToken = process.env.LISTINGS_FEED_TOKEN;

beforeEach(async () => {
  auth = await import("@/lib/listings-feed-auth");
});

afterEach(() => {
  if (originalToken === undefined) delete process.env.LISTINGS_FEED_TOKEN;
  else process.env.LISTINGS_FEED_TOKEN = originalToken;
});

function feedRequest(token?: string) {
  const url = token === undefined ? "https://app.example.com/api/listings/feed/zillow.xml" : `https://app.example.com/api/listings/feed/zillow.xml?token=${encodeURIComponent(token)}`;
  return new Request(url);
}

describe("isValidListingsFeedToken", () => {
  it("accepts an exact match", () => {
    process.env.LISTINGS_FEED_TOKEN = "super-secret-feed-token";
    expect(auth.isValidListingsFeedToken("super-secret-feed-token")).toBe(true);
  });

  it("rejects a wrong token", () => {
    process.env.LISTINGS_FEED_TOKEN = "super-secret-feed-token";
    expect(auth.isValidListingsFeedToken("nope")).toBe(false);
    expect(auth.isValidListingsFeedToken("super-secret-feed-toke")).toBe(false);
    expect(auth.isValidListingsFeedToken("super-secret-feed-token-extra")).toBe(false);
  });

  it("rejects null/empty input", () => {
    process.env.LISTINGS_FEED_TOKEN = "super-secret-feed-token";
    expect(auth.isValidListingsFeedToken(null)).toBe(false);
    expect(auth.isValidListingsFeedToken("")).toBe(false);
  });

  it("fails closed when no token is configured", () => {
    delete process.env.LISTINGS_FEED_TOKEN;
    expect(auth.isListingsFeedTokenConfigured()).toBe(false);
    expect(auth.isValidListingsFeedToken("anything")).toBe(false);
    expect(auth.isValidListingsFeedToken("")).toBe(false);

    process.env.LISTINGS_FEED_TOKEN = "   ";
    expect(auth.isListingsFeedTokenConfigured()).toBe(false);
    expect(auth.isValidListingsFeedToken("   ")).toBe(false);
  });
});

describe("rejectUnauthorizedFeedRequest", () => {
  it("returns a 401 (no-store) when the token is missing or wrong", () => {
    process.env.LISTINGS_FEED_TOKEN = "super-secret-feed-token";

    const missing = auth.rejectUnauthorizedFeedRequest(feedRequest());
    expect(missing?.status).toBe(401);
    expect(missing?.headers.get("Cache-Control")).toBe("no-store");

    const wrong = auth.rejectUnauthorizedFeedRequest(feedRequest("wrong"));
    expect(wrong?.status).toBe(401);
  });

  it("returns null (authorized) when the token matches", () => {
    process.env.LISTINGS_FEED_TOKEN = "super-secret-feed-token";
    expect(auth.rejectUnauthorizedFeedRequest(feedRequest("super-secret-feed-token"))).toBeNull();
  });

  it("blocks every request when no token is configured", () => {
    delete process.env.LISTINGS_FEED_TOKEN;
    expect(auth.rejectUnauthorizedFeedRequest(feedRequest("anything"))?.status).toBe(401);
  });
});
