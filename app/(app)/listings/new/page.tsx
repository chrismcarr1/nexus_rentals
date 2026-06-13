import { PageHeader } from "@/components/page-header";
import { ListingEditor, type ListingPropertyOption, type ListingUnitOption } from "@/components/listings/listing-editor";
import { formatAddress } from "@/lib/address";
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
    photoUrls: unitPhotos(unit.id)
  }));

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
      <ListingEditor mode="create" properties={properties} units={units} error={error} />
    </div>
  );
}
