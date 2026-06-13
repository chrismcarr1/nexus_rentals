import "server-only";

import { formatUnitAddress } from "@/lib/address";
import type { AppStore, Listing, ListingStatus, Property, Unit, User } from "@/lib/store";

export const listingStatusLabels: Record<ListingStatus, string> = {
  draft: "Draft",
  active: "Active",
  unpublished: "Unpublished"
};

export function listingStatusTone(status: ListingStatus): "default" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "default";
}

// Required fields for a listing to be eligible for outbound syndication feeds.
// These map onto the Zillow/Apartments.com minimum data set: a complete
// address, price, bed/bath counts, availability, a description, working
// contact details, and at least one photo.
export const FEED_REQUIRED_FIELDS = [
  { key: "address", label: "Full property address" },
  { key: "rent", label: "Rent" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "bathrooms", label: "Bathrooms" },
  { key: "availabilityDate", label: "Availability date" },
  { key: "description", label: "Description" },
  { key: "contactName", label: "Contact name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "photos", label: "At least one photo" }
] as const;

export function getListingProperty(store: AppStore, listing: Listing): Property | null {
  return store.properties.find((property) => property.id === listing.propertyId) ?? null;
}

export function getListingUnit(store: AppStore, listing: Listing): Unit | null {
  return listing.unitId ? store.units.find((unit) => unit.id === listing.unitId) ?? null : null;
}

export function managerOwnsListing(store: AppStore, user: User, listing: Listing) {
  if (listing.organizationId !== user.organizationId) return false;
  // Admins manage every listing in their organization; managers manage the
  // listings tied to a property they are assigned to.
  if (user.role === "ADMIN") return true;
  const property = getListingProperty(store, listing);
  return Boolean(property && property.managerId === user.id && listing.managerUserId === user.id);
}

export function getListingLocationLabel(store: AppStore, listing: Listing) {
  const property = getListingProperty(store, listing);
  const unit = getListingUnit(store, listing);
  if (!property) return "Property unavailable";
  return unit ? `${property.name} - Unit ${unit.unitNumber}` : property.name;
}

export function getListingAddressLabel(store: AppStore, listing: Listing) {
  const property = getListingProperty(store, listing);
  if (!property) return "";
  return formatUnitAddress(property, getListingUnit(store, listing));
}

export function getListingTitle(store: AppStore, listing: Listing) {
  const property = getListingProperty(store, listing);
  const bedLabel = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`;
  const base = property ? property.name : "Rental listing";
  return `${base} · ${bedLabel} / ${listing.bathrooms} ba`;
}

// Returns the human-readable labels of every feed-required field the listing is
// still missing. An empty array means the listing is feed-ready.
export function getMissingFeedFields(store: AppStore, listing: Listing): string[] {
  const address = getListingAddressLabel(store, listing);
  const addressComplete = Boolean(address) && address !== "Address unavailable" && address !== "Incomplete address";

  const present: Record<string, boolean> = {
    address: addressComplete,
    rent: Number.isFinite(listing.rent) && listing.rent > 0,
    bedrooms: Number.isFinite(listing.bedrooms) && listing.bedrooms >= 0 && listing.bedrooms !== undefined,
    bathrooms: Number.isFinite(listing.bathrooms) && listing.bathrooms > 0,
    availabilityDate: Boolean(listing.availabilityDate),
    description: Boolean(listing.description && listing.description.trim().length >= 20),
    contactName: Boolean(listing.contactName && listing.contactName.trim()),
    contactEmail: Boolean(listing.contactEmail && /.+@.+\..+/.test(listing.contactEmail.trim())),
    contactPhone: Boolean(listing.contactPhone && listing.contactPhone.trim()),
    photos: Array.isArray(listing.photoUrls) && listing.photoUrls.length > 0
  };

  return FEED_REQUIRED_FIELDS.filter((field) => !present[field.key]).map((field) => field.label);
}

export function validateListingReadiness(store: AppStore, listing: Listing) {
  const missing = getMissingFeedFields(store, listing);
  return { ready: missing.length === 0, missing };
}

// A listing only appears in public syndication feeds when it is both published
// (status active) and passes every feed-readiness requirement.
export function isFeedEligible(store: AppStore, listing: Listing) {
  return listing.status === "active" && validateListingReadiness(store, listing).ready;
}
