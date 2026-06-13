import type { RentalListingFeedItem } from "@/lib/syndication/listing-feed";

export type GenericListingFeed = {
  feed: "nexus-generic-rental-feed";
  version: string;
  generatedAt: string;
  count: number;
  listings: RentalListingFeedItem[];
};

// Partner-neutral JSON feed. Useful for debugging the syndication pipeline and
// as the canonical shape future partner adapters can transform from.
export function buildGenericFeed(items: RentalListingFeedItem[], generatedAt = new Date().toISOString()): GenericListingFeed {
  return {
    feed: "nexus-generic-rental-feed",
    version: "1.0",
    generatedAt,
    count: items.length,
    listings: items
  };
}
