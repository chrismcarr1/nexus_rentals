import "server-only";

import { timingSafeEqual } from "crypto";

// Shared secret that gates the public listing feeds. External partners (Zillow,
// Apartments.com, debugging integrations) append it as ?token=... The feeds are
// intentionally not behind the normal app login so partner crawlers can reach
// them, so this token is the only access control — keep it long and random.
export function getListingsFeedToken(): string {
  return process.env.LISTINGS_FEED_TOKEN?.trim() ?? "";
}

export function isListingsFeedTokenConfigured(): boolean {
  return getListingsFeedToken().length > 0;
}

// Constant-time comparison of the supplied token against the configured one.
// Fail-closed: if no token is configured the feeds deny every request, so an
// unset/blank env var can never accidentally expose an open feed.
export function isValidListingsFeedToken(provided: string | null | undefined): boolean {
  const expected = getListingsFeedToken();
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  // timingSafeEqual throws on length mismatch; a differing length is already a
  // mismatch, so short-circuit (this only leaks token length, which is fine).
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

// Validates the ?token=... query param on a feed request. Returns a 401 Response
// to short-circuit the handler when the token is missing/invalid, or null when
// the request is authorized.
export function rejectUnauthorizedFeedRequest(request: Request): Response | null {
  const token = new URL(request.url).searchParams.get("token");
  if (isValidListingsFeedToken(token)) return null;
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
