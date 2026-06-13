import { rejectUnauthorizedFeedRequest } from "@/lib/listings-feed-auth";
import { buildGenericFeed } from "@/lib/syndication/generic-feed";
import { buildListingFeedItems } from "@/lib/syndication/listing-feed";
import { readStore } from "@/lib/store";

// Always read the live datastore per request. Without this, Next.js can treat a
// dependency-free GET handler as statically cacheable and freeze the response at
// build time (when no listings exist yet), so the deployed feed would keep
// returning count: 0 even after listings are published. force-dynamic +
// revalidate: 0 guarantee each request re-reads Neon.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, partner-neutral JSON feed of every active, feed-ready listing.
// Draft/unpublished/incomplete listings are excluded by buildListingFeedItems,
// and the feed item DTO only carries public marketing data — never tenant
// information or private notes. Useful for debugging syndication.
export async function GET(request: Request) {
  // Token gate (no app login): missing/invalid ?token=... returns 401.
  const unauthorized = rejectUnauthorizedFeedRequest(request);
  if (unauthorized) return unauthorized;

  const store = await readStore();
  const feed = buildGenericFeed(buildListingFeedItems(store));

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Never let a CDN/browser serve a stale (possibly empty) feed; partners
      // poll infrequently, so live correctness beats edge caching here.
      "Cache-Control": "no-store"
    }
  });
}
