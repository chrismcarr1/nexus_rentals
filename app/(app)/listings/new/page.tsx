import { PageHeader } from "@/components/page-header";
import { ListingEditor, type ListingPropertyOption, type ListingUnitOption } from "@/components/listings/listing-editor";
import { formatAddress } from "@/lib/address";
import { appDateKeyFromValue } from "@/lib/app-time";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

export default async function NewListingPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.ADMIN]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};

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

  // A "Create Listing" link from a property/unit page may preselect the source.
  const initialPropertyId = properties.some((property) => property.id === params.propertyId) ? params.propertyId : undefined;
  const initialUnit = units.find((unit) => unit.id === params.unitId && unit.propertyId === initialPropertyId);
  const initialUnitId = initialUnit?.id;

  const error =
    params.error === "invalid"
      ? "Review the listing details and complete the required fields."
      : params.error
        ? decodeURIComponent(params.error)
        : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Listings"
        title="Create Listing"
        description="Build a rental listing from an existing property or unit, then publish it to your syndication feeds."
      />
      <ListingEditor
        mode="create"
        properties={properties}
        units={units}
        initialPropertyId={initialPropertyId}
        initialUnitId={initialUnitId}
        error={error}
      />
    </div>
  );
}
