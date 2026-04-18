import { getOrganizationSnapshot } from "@/lib/store";

export async function globalSearch(organizationId: string, query?: string) {
  if (!query?.trim()) {
    return { properties: [], units: [], tenants: [] };
  }

  const needle = query.toLowerCase();
  const snapshot = await getOrganizationSnapshot(organizationId);

  return {
    properties: snapshot.properties
      .filter((item) => [item.name, item.city, item.addressLine1].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6),
    units: snapshot.units
      .filter((item) => [item.unitNumber, item.nickname ?? "", item.unitType].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6)
      .map((unit) => ({ ...unit, property: snapshot.properties.find((property) => property.id === unit.propertyId)! })),
    tenants: snapshot.tenants
      .filter((item) => [item.firstName, item.lastName, item.email ?? ""].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6)
  };
}
