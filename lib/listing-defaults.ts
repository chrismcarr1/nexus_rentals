// Framework-agnostic mapping from a property + unit onto the default values for
// a new listing. This is the single source of truth for listing autofill: it is
// used by the client listing editor (live autofill when a manager picks a
// property/unit) so behavior stays identical at every create-listing entry
// point. It is intentionally free of "server-only" so it can run in the browser.

export type ListingDefaultsProperty = {
  id: string;
  description?: string | null;
  amenities?: string | null;
  petPolicy?: string | null;
  parking?: string | null;
  utilities?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  photoUrls?: string[];
};

export type ListingDefaultsUnit = {
  id: string;
  monthlyRent?: number | null;
  depositAmount?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  // Already normalized to whatever string convention the listing form expects
  // (a yyyy-mm-dd date key in the editor); passed through untouched.
  availabilityDate?: string | null;
  leaseTerms?: string | null;
  unitDescription?: string | null;
  amenities?: string | null;
  photoUrls?: string[];
};

export type ListingDefaults = {
  propertyId: string;
  unitId?: string;
  rent: number;
  deposit: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  availabilityDate?: string;
  leaseTerms?: string;
  description: string;
  amenities: string;
  petPolicy: string;
  parking: string;
  utilities: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  photoUrls: string[];
};

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Merge comma-separated amenity lists, trimming blanks and removing
// case-insensitive duplicates while preserving first-seen ordering (property
// amenities first, then any unit-specific extras).
export function mergeAmenities(...lists: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const part of clean(list).split(",")) {
      const value = part.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
  }
  return result.join(", ");
}

// Build the default listing draft for a property and (optional) unit. Unit-level
// data wins for pricing/layout fields; property-level data supplies the shared
// marketing/contact fields. Photos prefer the unit's gallery, falling back to
// the property's.
export function buildListingDefaultsFromPropertyUnit(
  property: ListingDefaultsProperty,
  unit?: ListingDefaultsUnit | null
): ListingDefaults {
  const unitPhotos = (unit?.photoUrls ?? []).filter(Boolean);
  const propertyPhotos = (property.photoUrls ?? []).filter(Boolean);
  const photoUrls = unitPhotos.length ? unitPhotos : propertyPhotos;

  const squareFeet =
    unit?.squareFeet != null && Number.isFinite(unit.squareFeet) ? unit.squareFeet : undefined;

  return {
    propertyId: property.id,
    unitId: unit?.id,
    rent: numberOr(unit?.monthlyRent, 0),
    deposit: numberOr(unit?.depositAmount, 0),
    bedrooms: numberOr(unit?.bedrooms, 0),
    bathrooms: numberOr(unit?.bathrooms, 0),
    squareFeet,
    availabilityDate: clean(unit?.availabilityDate) || undefined,
    leaseTerms: clean(unit?.leaseTerms) || undefined,
    // Prefer the unit description, fall back to the property description.
    description: clean(unit?.unitDescription) || clean(property.description),
    amenities: mergeAmenities(property.amenities, unit?.amenities),
    petPolicy: clean(property.petPolicy),
    parking: clean(property.parking),
    utilities: clean(property.utilities),
    contactName: clean(property.contactName),
    contactEmail: clean(property.contactEmail),
    contactPhone: clean(property.contactPhone),
    photoUrls
  };
}
