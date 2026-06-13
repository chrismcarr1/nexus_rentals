import { buildListingFeedItems } from "@/lib/syndication/listing-feed";
import { buildZillowFeedXml } from "@/lib/syndication/zillow-feed";
import { readStore } from "@/lib/store";

// Public MITS/Zillow-style XML feed of every active, feed-ready listing. This is
// a Phase 1 hosted feed: it must be validated and approved by Zillow /
// Apartments.com before listings can syndicate externally. Only public listing
// marketing data is exposed; all values are XML-escaped in buildZillowFeedXml.
export async function GET() {
  const store = await readStore();
  const xml = buildZillowFeedXml(buildListingFeedItems(store));

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
