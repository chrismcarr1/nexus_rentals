import { buildGenericFeed } from "@/lib/syndication/generic-feed";
import { buildListingFeedItems } from "@/lib/syndication/listing-feed";
import { readStore } from "@/lib/store";

// Public, partner-neutral JSON feed of every active, feed-ready listing.
// Draft/unpublished/incomplete listings are excluded by buildListingFeedItems,
// and the feed item DTO only carries public marketing data — never tenant
// information or private notes. Useful for debugging syndication.
export async function GET() {
  const store = await readStore();
  const feed = buildGenericFeed(buildListingFeedItems(store));

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
