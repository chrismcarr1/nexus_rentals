import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ListingEditor, type ListingFormValues, type ListingPropertyOption, type ListingUnitOption } from "@/components/listings/listing-editor";
import { formatAddress } from "@/lib/address";
import { appDateKeyFromValue } from "@/lib/app-time";
import { requireRoles } from "@/lib/auth";
import { managerOwnsListing } from "@/lib/listings";
import { readStore, UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

export default async function EditListingPage({
  params,
  searchParams
}: {
  params: Promise<{ listingId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.ADMIN]);
  const { listingId } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const listing = store.listings.find((item) => item.id === listingId);
  if (!listing || !managerOwnsListing(store, user, listing)) {
    notFound();
  }

  const portal = await getPortalContext(user);
  const propertyPhotos = (propertyId: string) =>
    portal.scope.files.filter((file) => file.kind === "PROPERTY_IMAGE" && file.propertyId === propertyId).map((file) => file.path);
  const unitPhotos = (unitId: string) =>
    portal.scope.files.filter((file) => file.kind === "UNIT_IMAGE" && file.unitId === unitId).map((file) => file.path);

  const properties: ListingPropertyOption[] = portal.scope.properties.map((property) => ({
    id: property.id,
    name: property.name,
    formattedAddress: formatAddress(property),
    description: property.description,
    amenities: property.amenities,
    petPolicy: property.petPolicy,
    parking: property.parking,
    utilities: property.utilities,
    contactName: property.contactName,
    contactEmail: property.contactEmail,
    contactPhone: property.contactPhone,
    photoUrls: propertyPhotos(property.id)
  }));
  const units: ListingUnitOption[] = portal.scope.units.map((unit) => ({
    id: unit.id,
    propertyId: unit.propertyId,
    unitNumber: unit.unitNumber,
    monthlyRent: unit.monthlyRent,
    depositAmount: unit.depositAmount,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    squareFeet: unit.squareFeet,
    availabilityDate: unit.availabilityDate ? appDateKeyFromValue(unit.availabilityDate) : undefined,
    leaseTerms: unit.leaseTerms,
    unitDescription: unit.unitDescription,
    amenities: unit.amenities,
    photoUrls: unitPhotos(unit.id)
  }));

  const values: ListingFormValues = {
    id: listing.id,
    propertyId: listing.propertyId,
    unitId: listing.unitId ?? "",
    rent: String(listing.rent ?? ""),
    deposit: String(listing.deposit ?? ""),
    bedrooms: String(listing.bedrooms ?? ""),
    bathrooms: String(listing.bathrooms ?? ""),
    squareFeet: listing.squareFeet != null ? String(listing.squareFeet) : "",
    availabilityDate: listing.availabilityDate ? appDateKeyFromValue(listing.availabilityDate) : "",
    leaseTerms: listing.leaseTerms ?? "",
    description: listing.description ?? "",
    amenities: listing.amenities ?? "",
    petPolicy: listing.petPolicy ?? "",
    parking: listing.parking ?? "",
    utilities: listing.utilities ?? "",
    contactName: listing.contactName ?? "",
    contactEmail: listing.contactEmail ?? "",
    contactPhone: listing.contactPhone ?? "",
    photoUrls: listing.photoUrls ?? []
  };

  const error =
    query.error === "invalid"
      ? "Review the listing details and complete the required fields."
      : query.error
        ? decodeURIComponent(query.error)
        : undefined;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Listings" title="Edit Listing" description="Update listing details. Active listings missing a required field are automatically unpublished." />
      <ListingEditor mode="edit" properties={properties} units={units} values={values} error={error} />
    </div>
  );
}
