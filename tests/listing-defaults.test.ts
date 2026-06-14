import { describe, expect, it, vi } from "vitest";

import {
  buildListingDefaultsFromPropertyUnit,
  mergeAmenities,
  type ListingDefaultsProperty,
  type ListingDefaultsUnit
} from "@/lib/listing-defaults";

// lib/listings is server-only; stub the guard so we can assert that an
// autofilled draft satisfies the existing feed-readiness validation.
vi.mock("server-only", () => ({}));

const property: ListingDefaultsProperty = {
  id: "p1",
  description: "A well-kept fourplex near the park.",
  amenities: "Parking, Laundry",
  petPolicy: "Cats welcome",
  parking: "1 covered space",
  utilities: "Water included",
  contactName: "Jane Doe",
  contactEmail: "jane@example.com",
  contactPhone: "512-555-1212",
  photoUrls: ["https://cdn.example.com/property-1.jpg"]
};

const unit: ListingDefaultsUnit = {
  id: "u1",
  monthlyRent: 1800,
  depositAmount: 1700,
  bedrooms: 2,
  bathrooms: 1.5,
  squareFeet: 850,
  availabilityDate: "2026-07-01",
  leaseTerms: "12-month",
  unitDescription: "Bright corner unit with new appliances.",
  amenities: "Laundry, Central AC",
  photoUrls: ["https://cdn.example.com/unit-1.jpg"]
};

describe("buildListingDefaultsFromPropertyUnit", () => {
  it("maps unit fields onto pricing/layout and property fields onto shared listing fields", () => {
    const defaults = buildListingDefaultsFromPropertyUnit(property, unit);
    expect(defaults.propertyId).toBe("p1");
    expect(defaults.unitId).toBe("u1");
    // Unit wins for pricing/layout/availability/terms.
    expect(defaults.rent).toBe(1800);
    expect(defaults.deposit).toBe(1700);
    expect(defaults.bedrooms).toBe(2);
    expect(defaults.bathrooms).toBe(1.5);
    expect(defaults.squareFeet).toBe(850);
    expect(defaults.availabilityDate).toBe("2026-07-01");
    expect(defaults.leaseTerms).toBe("12-month");
    // Property supplies the shared marketing/contact fields.
    expect(defaults.petPolicy).toBe("Cats welcome");
    expect(defaults.parking).toBe("1 covered space");
    expect(defaults.utilities).toBe("Water included");
    expect(defaults.contactName).toBe("Jane Doe");
    expect(defaults.contactEmail).toBe("jane@example.com");
    expect(defaults.contactPhone).toBe("512-555-1212");
  });

  it("prefers the unit description, falling back to the property description", () => {
    expect(buildListingDefaultsFromPropertyUnit(property, unit).description).toBe(
      "Bright corner unit with new appliances."
    );
    const noUnitDescription = buildListingDefaultsFromPropertyUnit(property, { ...unit, unitDescription: "  " });
    expect(noUnitDescription.description).toBe("A well-kept fourplex near the park.");
  });

  it("combines property and unit amenities and removes case-insensitive duplicates", () => {
    const defaults = buildListingDefaultsFromPropertyUnit(property, unit);
    // "Laundry" appears in both lists and is only kept once; ordering is property-first.
    expect(defaults.amenities).toBe("Parking, Laundry, Central AC");
  });

  it("uses unit photos when present, otherwise property photos", () => {
    expect(buildListingDefaultsFromPropertyUnit(property, unit).photoUrls).toEqual([
      "https://cdn.example.com/unit-1.jpg"
    ]);
    const noUnitPhotos = buildListingDefaultsFromPropertyUnit(property, { ...unit, photoUrls: [] });
    expect(noUnitPhotos.photoUrls).toEqual(["https://cdn.example.com/property-1.jpg"]);
  });

  it("falls back to property data and safe defaults when no unit is selected", () => {
    const defaults = buildListingDefaultsFromPropertyUnit(property, null);
    expect(defaults.unitId).toBeUndefined();
    expect(defaults.rent).toBe(0);
    expect(defaults.deposit).toBe(0);
    expect(defaults.bedrooms).toBe(0);
    expect(defaults.squareFeet).toBeUndefined();
    expect(defaults.availabilityDate).toBeUndefined();
    expect(defaults.description).toBe("A well-kept fourplex near the park.");
    expect(defaults.amenities).toBe("Parking, Laundry");
    expect(defaults.photoUrls).toEqual(["https://cdn.example.com/property-1.jpg"]);
  });

  it("does not break on legacy property/unit records missing the new fields", () => {
    const bareProperty: ListingDefaultsProperty = { id: "p2" };
    const bareUnit: ListingDefaultsUnit = { id: "u2" };
    const defaults = buildListingDefaultsFromPropertyUnit(bareProperty, bareUnit);
    expect(defaults).toMatchObject({
      propertyId: "p2",
      unitId: "u2",
      rent: 0,
      deposit: 0,
      bedrooms: 0,
      bathrooms: 0,
      description: "",
      amenities: "",
      petPolicy: "",
      parking: "",
      utilities: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      photoUrls: []
    });
    expect(defaults.squareFeet).toBeUndefined();
  });
});

describe("mergeAmenities", () => {
  it("trims, dedupes case-insensitively, and preserves first-seen order", () => {
    expect(mergeAmenities("Parking, laundry ", " LAUNDRY, Central AC", "")).toBe("Parking, laundry, Central AC");
  });

  it("returns an empty string when given no amenities", () => {
    expect(mergeAmenities(undefined, null, "  ,  ")).toBe("");
  });
});

describe("autofilled draft feeds into existing readiness validation", () => {
  it("an autofilled draft with a photo and address passes feed readiness", async () => {
    const listings = await import("@/lib/listings");
    const defaults = buildListingDefaultsFromPropertyUnit(property, unit);

    const storeProperty = {
      id: "p1",
      organizationId: "o1",
      name: "Parkside",
      status: "ACTIVE",
      amenities: "",
      addressLine1: "123 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };
    const storeUnit = { id: "u1", propertyId: "p1", unitNumber: "2B" };

    const listing = {
      id: "l1",
      organizationId: "o1",
      managerUserId: "m1",
      status: "draft",
      ...defaults,
      // A feed-ready listing needs an 80+ char description; the fixture's unit
      // description is shorter, so set a professional one for this check.
      description: "Charming two-bedroom, one-bath rental near the park with in-unit laundry and easy access to restaurants and shops.",
      // availabilityDate on a real listing is stored ISO; readiness only checks presence.
      availabilityDate: "2026-07-01T12:00:00Z",
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z"
    };

    const store: any = { properties: [storeProperty], units: [storeUnit], listings: [listing] };
    const result = listings.validateListingReadiness(store, listing as any);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
