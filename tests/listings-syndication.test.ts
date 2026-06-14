import { beforeAll, describe, expect, it, vi } from "vitest";

// lib/listings and lib/syndication/* are server modules; stub the server-only
// guard so they can be imported in the test runner.
vi.mock("server-only", () => ({}));

type AnyStore = any;

const property = {
  id: "p1",
  organizationId: "o1",
  name: "Oakview",
  status: "ACTIVE",
  amenities: "",
  managerId: "m1",
  addressLine1: "123 Main St",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};

const unit = {
  id: "u1",
  propertyId: "p1",
  unitNumber: "2B",
  unitType: "APARTMENT",
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 1800,
  depositAmount: 1800,
  leaseStatus: "VACANT",
  occupancyStatus: "VACANT",
  amenities: "",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    organizationId: "o1",
    managerUserId: "m1",
    propertyId: "p1",
    unitId: "u1",
    status: "active",
    rent: 1800,
    deposit: 1800,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 850,
    availabilityDate: "2026-07-01T12:00:00Z",
    leaseTerms: "12-month",
    description: "A bright, beautifully maintained two-bedroom apartment in the heart of downtown with great natural light and walkable access to restaurants and shops.",
    amenities: "In-unit laundry, Central AC",
    petPolicy: "Cats welcome",
    parking: "1 space",
    utilities: "Water included",
    contactName: "Jane Doe",
    contactEmail: "jane@example.com",
    contactPhone: "512-555-1212",
    photoUrls: ["https://cdn.example.com/1.jpg"],
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
    ...overrides
  };
}

let listings: typeof import("@/lib/listings");
let listingFeed: typeof import("@/lib/syndication/listing-feed");
let zillow: typeof import("@/lib/syndication/zillow-feed");
let generic: typeof import("@/lib/syndication/generic-feed");

beforeAll(async () => {
  listings = await import("@/lib/listings");
  listingFeed = await import("@/lib/syndication/listing-feed");
  zillow = await import("@/lib/syndication/zillow-feed");
  generic = await import("@/lib/syndication/generic-feed");
});

function storeWith(listing: ReturnType<typeof makeListing>): AnyStore {
  return { properties: [property], units: [unit], listings: [listing] };
}

describe("listing feed readiness", () => {
  it("treats a fully-populated active listing as feed-ready", () => {
    const listing = makeListing();
    const result = listings.validateListingReadiness(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports each missing required field", () => {
    const listing = makeListing({ description: "", photoUrls: [], contactEmail: "" });
    const missing = listings.getMissingFeedFields(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(missing).toContain("Description");
    expect(missing).toContain("At least one photo");
    expect(missing).toContain("Public contact email");
    expect(missing).not.toContain("Rent");
  });

  it("flags a missing address when the property cannot be resolved", () => {
    const listing = makeListing();
    const store: AnyStore = { properties: [], units: [], listings: [listing] };
    const missing = listings.getMissingFeedFields(store, listing as AnyStore);
    expect(missing).toContain("Full property address");
  });

  it("blocks a present-but-too-short description with a specific message", () => {
    const listing = makeListing({ description: "Cute place near downtown." });
    const result = listings.validateListingReadiness(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("Description must be at least 80 characters");
  });

  it("treats an 80+ character description as feed-ready", () => {
    const listing = makeListing({
      description: "Charming two-bedroom, one-bath rental near Old Colorado City with in-unit laundry and easy access to restaurants and shops."
    });
    expect(listings.validateListingReadiness(storeWith(listing) as AnyStore, listing as AnyStore).ready).toBe(true);
  });

  it("blocks an invalid public contact email", () => {
    const listing = makeListing({ contactEmail: "not-an-email" });
    const result = listings.validateListingReadiness(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("Public contact email is invalid");
  });

  it("blocks an invalid public contact phone", () => {
    const listing = makeListing({ contactPhone: "123" });
    const result = listings.validateListingReadiness(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("Public contact phone is invalid");
  });
});

describe("buildListingFeedItems", () => {
  it("includes only active, feed-ready listings", () => {
    const ready = makeListing({ id: "ready" });
    const draft = makeListing({ id: "draft", status: "draft" });
    const incomplete = makeListing({ id: "incomplete", photoUrls: [] });
    const store: AnyStore = { properties: [property], units: [unit], listings: [ready, draft, incomplete] };
    const items = listingFeed.buildListingFeedItems(store);
    expect(items.map((item) => item.listingId)).toEqual(["ready"]);
  });

  it("maps amenities into separate clean array items and resolves the address", () => {
    const listing = makeListing();
    const item = listingFeed.listingToFeedItem(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(item.amenities).toEqual(["In-unit laundry", "Central AC"]);
    expect(item.address).toContain("123 Main St");
    expect(item.unitNumber).toBe("2B");
  });

  it("emits clean public contact fields with a normalized phone", () => {
    const listing = makeListing({ contactPhone: "6304145868" });
    const item = listingFeed.listingToFeedItem(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(item.contactName).toBe("Jane Doe");
    expect(item.contactEmail).toBe("jane@example.com");
    expect(item.contactPhone).toBe("(630) 414-5868");
  });

  it("keeps amenities as separate items even with mixed separators", () => {
    const listing = makeListing({ amenities: "In-unit washer/dryer; Walkable to restaurants\nDishwasher, Dishwasher" });
    const item = listingFeed.listingToFeedItem(storeWith(listing) as AnyStore, listing as AnyStore);
    expect(item.amenities).toEqual(["In-unit washer/dryer", "Walkable to restaurants", "Dishwasher"]);
  });
});

describe("zillow xml feed", () => {
  it("escapes XML-significant characters", () => {
    expect(zillow.escapeXml(`Tom & "Jerry" <3 'cats'`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;3 &apos;cats&apos;");
  });

  it("produces a valid XML document and never leaks raw special characters from listing data", () => {
    const listing = makeListing({
      description: "Spacious & sunny <loft> with exposed brick, in-unit laundry, and a walkable location near cafes, shops, and restaurants."
    });
    const items = listingFeed.buildListingFeedItems(storeWith(listing) as AnyStore);
    const xml = zillow.buildZillowFeedXml(items);
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<ListingId>l1</ListingId>");
    expect(xml).toContain("Spacious &amp; sunny &lt;loft&gt;");
    expect(xml).not.toContain("<loft>");
  });
});

describe("generic json feed", () => {
  it("wraps items with count and metadata", () => {
    const listing = makeListing();
    const items = listingFeed.buildListingFeedItems(storeWith(listing) as AnyStore);
    const feed = generic.buildGenericFeed(items, "2026-06-13T00:00:00Z");
    expect(feed.count).toBe(1);
    expect(feed.generatedAt).toBe("2026-06-13T00:00:00Z");
    expect(feed.listings[0].listingId).toBe("l1");
  });

  it("emits clean public contact fields and separate amenities", () => {
    const listing = makeListing({ contactPhone: "(630) 414-5868" });
    const items = listingFeed.buildListingFeedItems(storeWith(listing) as AnyStore);
    const feed = generic.buildGenericFeed(items, "2026-06-13T00:00:00Z");
    expect(feed.listings[0].contactName).toBe("Jane Doe");
    expect(feed.listings[0].contactEmail).toBe("jane@example.com");
    expect(feed.listings[0].contactPhone).toBe("(630) 414-5868");
    expect(feed.listings[0].amenities).toEqual(["In-unit laundry", "Central AC"]);
  });
});

describe("zillow xml public contact + amenities", () => {
  it("emits normalized phone, contact fields, and a node per amenity", () => {
    const listing = makeListing({ contactPhone: "6304145868" });
    const items = listingFeed.buildListingFeedItems(storeWith(listing) as AnyStore);
    const xml = zillow.buildZillowFeedXml(items);
    expect(xml).toContain("<Name>Jane Doe</Name>");
    expect(xml).toContain("<Email>jane@example.com</Email>");
    expect(xml).toContain("<Phone>(630) 414-5868</Phone>");
    expect(xml).toContain("<Amenity><Type>In-unit laundry</Type></Amenity>");
    expect(xml).toContain("<Amenity><Type>Central AC</Type></Amenity>");
  });
});
