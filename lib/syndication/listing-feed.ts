import "server-only";

import { formatAddress, formatUnitAddress } from "@/lib/address";
import { normalizePublicListingPhone, splitListingAmenities } from "@/lib/listing-fields";
import {
  getListingProperty,
  getListingTitle,
  getListingUnit,
  isFeedEligible
} from "@/lib/listings";
import type { AppStore, Listing } from "@/lib/store";

// Generic, partner-neutral representation of a single rental listing. Every
// outbound feed (Zillow XML, generic JSON, future Apartments.com, etc.) is
// built from this DTO so partner-specific formatters never reach back into the
// raw datastore. It intentionally contains only public marketing data.
export type RentalListingFeedItem = {
  listingId: string;
  propertyId: string;
  unitId?: string;
  title: string;
  address: string;
  unitNumber?: string;
  rent: number;
  deposit: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  availabilityDate?: string;
  leaseTerms?: string;
  description?: string;
  amenities: string[];
  petPolicy?: string;
  parking?: string;
  utilities?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  photoUrls: string[];
  lastUpdated: string;
};

export function listingToFeedItem(store: AppStore, listing: Listing): RentalListingFeedItem {
  const property = getListingProperty(store, listing);
  const unit = getListingUnit(store, listing);
  const address = property ? formatUnitAddress(property, unit) : formatAddress(null);

  return {
    listingId: listing.id,
    propertyId: listing.propertyId,
    unitId: listing.unitId,
    title: getListingTitle(store, listing),
    address,
    unitNumber: unit?.unitNumber,
    rent: listing.rent,
    deposit: listing.deposit,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.squareFeet,
    availabilityDate: listing.availabilityDate,
    leaseTerms: listing.leaseTerms,
    description: listing.description,
    amenities: splitListingAmenities(listing.amenities),
    petPolicy: listing.petPolicy,
    parking: listing.parking,
    utilities: listing.utilities,
    contactName: listing.contactName,
    contactEmail: listing.contactEmail,
    // Normalize to a clean, human-readable phone for public partners.
    contactPhone: normalizePublicListingPhone(listing.contactPhone),
    photoUrls: listing.photoUrls ?? [],
    lastUpdated: listing.updatedAt
  };
}

// Builds the public feed item list: only active, feed-ready listings are
// included. Draft and unpublished listings — and any active listing still
// missing required fields — are excluded so partner feeds never expose
// incomplete data. Pass an organizationId to scope the feed to one org.
export function buildListingFeedItems(store: AppStore, organizationId?: string): RentalListingFeedItem[] {
  return store.listings
    .filter((listing) => (organizationId ? listing.organizationId === organizationId : true))
    .filter((listing) => isFeedEligible(store, listing))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((listing) => listingToFeedItem(store, listing));
}
