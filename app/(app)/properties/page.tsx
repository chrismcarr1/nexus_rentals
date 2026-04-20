import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { archivePropertyAction, assignPropertyManagerAction, createPropertyAction } from "@/lib/actions";
import { requireRouteAccess } from "@/lib/auth";
import { formatCurrency, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function PropertiesPage() {
  const user = await requireRouteAccess("/properties");
  const portal = await getPortalContext(user);
  const properties = portal.scope.properties.map((property) => ({
    ...property,
    units: portal.scope.units.filter((unit) => unit.propertyId === property.id)
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Portfolio overview" : "Assigned properties"}
        title={user.role === "ADMIN" ? "Property portfolio, unit inventory, and manager coverage." : "Operations for the buildings currently assigned to you."}
        description={
          user.role === "ADMIN"
            ? "Review portfolio health, assign managers, archive assets, and create new properties with a cleaner operational hierarchy."
            : "See only the properties and unit inventory relevant to your operating scope, with direct visibility into occupancy and assigned rent."
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {properties.length === 0 ? <EmptyState title="No properties in scope" description="There are no properties available for this role right now." /> : null}
          {properties.map((property) => (
            <Link key={property.id} href={`/properties/${property.id}`}>
              <Card className="h-full overflow-hidden">
                <div className="h-48 bg-[linear-gradient(135deg,#102842,#1f6b5f)] p-5 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em] text-white/64">Property</p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{property.name}</h2>
                      <p className="mt-3 text-sm text-white/78">{property.city}, {property.state}</p>
                    </div>
                    <Badge tone={property.status === "ARCHIVED" ? "warning" : "success"}>{property.status}</Badge>
                  </div>
                </div>
                <div className="p-5 lg:p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">{property.units.length} units</p>
                    <p className="text-sm font-semibold">{formatCurrency(property.units.reduce((sum, unit) => sum + unit.monthlyRent, 0))}/mo</p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{property.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parseTags(property.amenities).slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full border border-[var(--line)] bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm text-[var(--muted)]">
                    <span>{property.units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length} occupied</span>
                    <span>{property.units.filter((unit) => unit.occupancyStatus === "VACANT" || unit.occupancyStatus === "TURNOVER").length} available</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">{user.role === "ADMIN" ? "Property creation" : "Add assigned asset"}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{user.role === "ADMIN" ? "Create a new portfolio asset" : "Create a property in your operating scope"}</h2>
            <form action={createPropertyAction} className="mt-6 space-y-4">
              <input name="name" placeholder="Property name" className="field" />
              <input name="addressLine1" placeholder="Address line 1" className="field" />
              <div className="grid gap-4 md:grid-cols-3">
                <input name="city" placeholder="City" className="field" />
                <input name="state" placeholder="State" maxLength={2} className="field" />
                <input name="postalCode" placeholder="Zip" className="field" />
              </div>
              <textarea name="description" placeholder="Asset summary" className="field min-h-24" />
              <input name="amenities" placeholder="Amenities, comma separated" className="field" />
              {user.role === "ADMIN" ? (
                <select name="managerId" className="field">
                  <option value="">Unassigned manager</option>
                  {portal.managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.firstName} {manager.lastName}
                    </option>
                  ))}
                </select>
              ) : null}
              <SingleUploadInput name="imagePath" label="Upload property cover image" />
              <SubmitButton>Save property</SubmitButton>
            </form>
          </Card>
          {user.role === "ADMIN" ? (
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Assignments and controls</p>
              <div className="mt-4 space-y-4">
                {properties.map((property) => (
                  <div key={property.id} className="panel-muted rounded-[24px] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{property.name}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {property.managerId ? `${portal.managers.find((manager) => manager.id === property.managerId)?.firstName ?? "Assigned"} manager assigned` : "No manager assigned"}
                        </p>
                      </div>
                      <form action={archivePropertyAction}>
                        <input type="hidden" name="propertyId" value={property.id} />
                        <Button variant="ghost">Archive</Button>
                      </form>
                    </div>
                    <form action={assignPropertyManagerAction} className="mt-3 flex gap-3">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <select name="managerId" defaultValue={property.managerId ?? ""} className="field">
                        <option value="">Unassigned</option>
                        {portal.managers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.firstName} {manager.lastName}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary">Assign</SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
