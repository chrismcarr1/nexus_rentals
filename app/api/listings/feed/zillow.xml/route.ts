import { rejectUnauthorizedFeedRequest } from "@/lib/listings-feed-auth";
import { buildListingFeedItems } from "@/lib/syndication/listing-feed";
import { buildZillowFeedXml } from "@/lib/syndication/zillow-feed";
import { readStore } from "@/lib/store";

// Always read the live datastore per request. Without this, Next.js can treat a
// dependency-free GET handler as statically cacheable and freeze the response at
// build time (when no listings exist yet), so the deployed feed would keep
// returning an empty document even after listings are published. force-dynamic +
// revalidate: 0 guarantee each request re-reads Neon.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public MITS/Zillow-style XML feed of every active, feed-ready listing. This is
// a Phase 1 hosted feed: it must be validated and approved by Zillow /
// Apartments.com before listings can syndicate externally. Only public listing
// marketing data is exposed; all values are XML-escaped in buildZillowFeedXml.
export async function GET(request: Request) {
  // Token gate (no app login): missing/invalid ?token=... returns 401.
  const unauthorized = rejectUnauthorizedFeedRequest(request);
  if (unauthorized) return unauthorized;

  const store = await readStore();
  const xml = buildZillowFeedXml(buildListingFeedItems(store));

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Never let a CDN/browser serve a stale (possibly empty) feed; partners
      // poll infrequently, so live correctness beats edge caching here.
      "Cache-Control": "no-store"
    }
  });
}
