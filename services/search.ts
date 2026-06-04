import { getAddressSearchText } from "@/lib/address";
import { getOrganizationSnapshot } from "@/lib/store";

type SearchScope = {
  propertyIds?: string[];
  unitIds?: string[];
  tenantIds?: string[];
};

export async function globalSearch(organizationId: string, query?: string, scope?: SearchScope) {
  if (!query?.trim()) {
    return { properties: [], units: [], tenants: [] };
  }

  const needle = query.toLowerCase();
  const snapshot = await getOrganizationSnapshot(organizationId);
  const allowedPropertyIds = new Set(scope?.propertyIds ?? snapshot.properties.map((item) => item.id));
  const allowedUnitIds = new Set(scope?.unitIds ?? snapshot.units.map((item) => item.id));
  const allowedTenantIds = new Set(scope?.tenantIds ?? snapshot.tenants.map((item) => item.id));

  return {
    properties: snapshot.properties
      .filter((item) => allowedPropertyIds.has(item.id))
      .filter((item) => [item.name, getAddressSearchText(item)].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6),
    units: snapshot.units
      .filter((item) => allowedUnitIds.has(item.id))
      .filter((item) => [item.unitNumber, item.nickname ?? "", item.unitType].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6)
      .map((unit) => ({ ...unit, property: snapshot.properties.find((property) => property.id === unit.propertyId)! })),
    tenants: snapshot.tenants
      .filter((item) => allowedTenantIds.has(item.id))
      .filter((item) => [item.firstName, item.lastName, item.email ?? ""].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6)
  };
}
