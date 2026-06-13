import type { RentalListingFeedItem } from "@/lib/syndication/listing-feed";

// IMPORTANT: This produces a MITS/Zillow-style XML document for a hosted rental
// feed. It is a Phase 1 foundation only. Before any listing can appear on
// Zillow or Apartments.com, Nexus must complete the partner's feed onboarding
// and the feed URL/structure must be validated and approved by them. Generating
// this XML does NOT publish anything externally.

// Escapes a value so it is safe to embed inside XML text or attribute content.
export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return `        <${name}>${escapeXml(value)}</${name}>`;
}

function feedItemXml(item: RentalListingFeedItem): string {
  const photos = item.photoUrls
    .map((url, index) => `          <File active="true"><Type>Photo</Type><Rank>${index + 1}</Rank><Src>${escapeXml(url)}</Src></File>`)
    .join("\n");
  const amenities = item.amenities
    .map((amenity) => `          <Amenity><Type>${escapeXml(amenity)}</Type></Amenity>`)
    .join("\n");

  return [
    `      <Property>`,
    `        <ListingId>${escapeXml(item.listingId)}</ListingId>`,
    tag("Title", item.title),
    `        <Address>`,
    tag("FullAddress", item.address),
    tag("UnitNumber", item.unitNumber),
    `        </Address>`,
    tag("MarketRent", item.rent.toFixed(2)),
    tag("DepositAmount", item.deposit.toFixed(2)),
    tag("Bedrooms", item.bedrooms),
    tag("Bathrooms", item.bathrooms),
    tag("SquareFeet", item.squareFeet),
    tag("AvailableDate", item.availabilityDate),
    tag("LeaseTerm", item.leaseTerms),
    tag("Description", item.description),
    tag("PetPolicy", item.petPolicy),
    tag("Parking", item.parking),
    tag("Utilities", item.utilities),
    amenities ? `        <Amenities>\n${amenities}\n        </Amenities>` : "",
    `        <ContactInformation>`,
    tag("Name", item.contactName),
    tag("Email", item.contactEmail),
    tag("Phone", item.contactPhone),
    `        </ContactInformation>`,
    photos ? `        <Files>\n${photos}\n        </Files>` : "",
    tag("LastUpdated", item.lastUpdated),
    `      </Property>`
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildZillowFeedXml(items: RentalListingFeedItem[], generatedAt = new Date().toISOString()): string {
  const properties = items.map(feedItemXml).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Nexus Rentals hosted listing feed (MITS/Zillow-style). Phase 1 foundation only:`,
    `     requires partner approval and feed validation before external syndication. -->`,
    `<PhysicalProperty>`,
    `  <Management>`,
    `    <Source>Nexus Rentals</Source>`,
    `    <GeneratedAt>${escapeXml(generatedAt)}</GeneratedAt>`,
    `    <ListingCount>${items.length}</ListingCount>`,
    `  </Management>`,
    `  <Properties>`,
    properties,
    `  </Properties>`,
    `</PhysicalProperty>`
  ]
    .filter(Boolean)
    .join("\n");
}
