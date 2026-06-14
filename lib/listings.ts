import "server-only";

import { formatUnitAddress } from "@/lib/address";
import {
  isValidPublicListingEmail,
  isValidPublicListingPhone,
  LISTING_DESCRIPTION_MIN_LENGTH
} from "@/lib/listing-fields";
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
// address, price, bed/bath counts, availability, a professional-length
// description, valid public contact details, and at least one photo.
export const FEED_REQUIRED_FIELDS = [
  { key: "address", label: "Full property address" },
  { key: "rent", label: "Rent" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "bathrooms", label: "Bathrooms" },
  { key: "availabilityDate", label: "Availability date" },
  { key: "description", label: `Description (${LISTING_DESCRIPTION_MIN_LENGTH}+ characters)` },
  { key: "contactName", label: "Public contact name" },
  { key: "contactEmail", label: "Public contact email" },
  { key: "contactPhone", label: "Public contact phone" },
  { key: "photos", label: "At least one photo" }
] as const;

export type ListingFeedFieldStatus = { key: string; label: string; ok: boolean; message: string };

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

// Per-field feed readiness for a listing. Each item carries the checklist
// `label` plus a specific `message` shown when the field is not ready (e.g. a
// present-but-too-short description, or an invalid contact email/phone). Drives
// both the readiness checklist UI and the missing-field warnings.
export function getListingReadiness(store: AppStore, listing: Listing): ListingFeedFieldStatus[] {
  const address = getListingAddressLabel(store, listing);
  const addressComplete = Boolean(address) && address !== "Address unavailable" && address !== "Incomplete address";

  const description = (listing.description ?? "").trim();
  const contactName = (listing.contactName ?? "").trim();
  const contactEmail = (listing.contactEmail ?? "").trim();
  const contactPhone = (listing.contactPhone ?? "").trim();

  const descriptionLabel = `Description (${LISTING_DESCRIPTION_MIN_LENGTH}+ characters)`;
  const descriptionStatus: ListingFeedFieldStatus =
    description.length === 0
      ? { key: "description", label: descriptionLabel, ok: false, message: "Description" }
      : description.length < LISTING_DESCRIPTION_MIN_LENGTH
        ? { key: "description", label: descriptionLabel, ok: false, message: `Description must be at least ${LISTING_DESCRIPTION_MIN_LENGTH} characters` }
        : { key: "description", label: descriptionLabel, ok: true, message: descriptionLabel };

  const emailStatus: ListingFeedFieldStatus =
    contactEmail.length === 0
      ? { key: "contactEmail", label: "Public contact email", ok: false, message: "Public contact email" }
      : !isValidPublicListingEmail(contactEmail)
        ? { key: "contactEmail", label: "Public contact email", ok: false, message: "Public contact email is invalid" }
        : { key: "contactEmail", label: "Public contact email", ok: true, message: "Public contact email" };

  const phoneStatus: ListingFeedFieldStatus =
    contactPhone.length === 0
      ? { key: "contactPhone", label: "Public contact phone", ok: false, message: "Public contact phone" }
      : !isValidPublicListingPhone(contactPhone)
        ? { key: "contactPhone", label: "Public contact phone", ok: false, message: "Public contact phone is invalid" }
        : { key: "contactPhone", label: "Public contact phone", ok: true, message: "Public contact phone" };

  return [
    { key: "address", label: "Full property address", ok: addressComplete, message: "Full property address" },
    { key: "rent", label: "Rent", ok: Number.isFinite(listing.rent) && listing.rent > 0, message: "Rent" },
    { key: "bedrooms", label: "Bedrooms", ok: Number.isFinite(listing.bedrooms) && listing.bedrooms >= 0, message: "Bedrooms" },
    { key: "bathrooms", label: "Bathrooms", ok: Number.isFinite(listing.bathrooms) && listing.bathrooms > 0, message: "Bathrooms" },
    { key: "availabilityDate", label: "Availability date", ok: Boolean(listing.availabilityDate), message: "Availability date" },
    descriptionStatus,
    { key: "contactName", label: "Public contact name", ok: contactName.length > 0, message: "Public contact name" },
    emailStatus,
    phoneStatus,
    { key: "photos", label: "At least one photo", ok: Array.isArray(listing.photoUrls) && listing.photoUrls.length > 0, message: "At least one photo" }
  ];
}

// Returns the warning message for every feed-required field the listing is
// still missing or has an invalid value for. An empty array means feed-ready.
export function getMissingFeedFields(store: AppStore, listing: Listing): string[] {
  return getListingReadiness(store, listing)
    .filter((field) => !field.ok)
    .map((field) => field.message);
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
