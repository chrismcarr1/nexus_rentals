import { PageHeader } from "@/components/page-header";
import { RentalApplicationBuilder, type ApplicationPropertyOption, type ApplicationUnitOption } from "@/components/rental-application-builder";
import { formatAddress } from "@/lib/address";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

export default async function NewApplicationPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const properties: ApplicationPropertyOption[] = portal.scope.properties.map((property) => ({
    id: property.id,
    name: property.name,
    formattedAddress: formatAddress(property)
  }));
  const units: ApplicationUnitOption[] = portal.scope.units.map((unit) => ({
    id: unit.id,
    propertyId: unit.propertyId,
    unitNumber: unit.unitNumber,
    monthlyRent: unit.monthlyRent,
    depositAmount: unit.depositAmount
  }));
  const error =
    params.error && params.error !== "invalid"
      ? params.error
      : params.error === "invalid"
        ? "Review the application setup and complete the required fields."
        : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Applications"
        title="Create Application"
        description="Publish a secure public application link for a property or unit in your manager portfolio."
      />
      <RentalApplicationBuilder properties={properties} units={units} error={error} />
    </div>
  );
}
