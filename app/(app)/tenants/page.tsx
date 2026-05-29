import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTenantAction } from "@/lib/actions";
import { requireRouteAccess } from "@/lib/auth";
import { getPortalContext } from "@/services/portal";

export default async function TenantsPage() {
  const user = await requireRouteAccess("/tenants");
  const portal = await getPortalContext(user);
  const tenantRows = portal.scope.tenants.map((tenant) => {
    const currentLease = portal.scope.leases.find((lease) => lease.tenantIds.includes(tenant.id) && (lease.status === "ACTIVE" || lease.status === "UPCOMING"));
    const unit = currentLease ? portal.scope.units.find((item) => item.id === currentLease.unitId) : null;
    const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;

    return { tenant, property, unit };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "People and leasing" : "Tenant roster"}
        title={user.role === "ADMIN" ? "Tenant directory with operator and manager visibility." : "Residents and active leases for your assigned buildings."}
        description={
          user.role === "ADMIN"
            ? "Review all residents, understand current tenancy placement, and keep visibility into the active manager team."
            : "Stay focused on the residents, lease placements, and contact information tied to the properties you manage."
        }
      />
      <div className="content-split">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Tenant directory</p>
          <DataTable columns={["Name", "Contact", "Employer", "Current unit"]} className="mt-5">
            {tenantRows.map(({ tenant, property, unit }) => (
              <tr key={tenant.id} className="table-row">
                <td className="py-4 pr-4 font-semibold">{tenant.firstName} {tenant.lastName}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{tenant.email || "No email"}<br />{tenant.phone || "No phone"}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{tenant.employer || "Not set"}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{property && unit ? `${property.name} ${unit.unitNumber}` : "No active lease"}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Add tenant</p>
            <form action={createTenantAction} className="mt-6 space-y-4">
              <div className="form-grid-2">
                <input name="firstName" placeholder="First name" className="field" />
                <input name="lastName" placeholder="Last name" className="field" />
              </div>
              <input name="email" type="email" placeholder="Email" className="field" />
              <input name="phone" placeholder="Phone" className="field" />
              <input name="employer" placeholder="Employer" className="field" />
              <textarea name="notes" placeholder="Notes" className="field min-h-24" />
              <SubmitButton>Create tenant</SubmitButton>
            </form>
          </Card>
          {user.role === "ADMIN" ? (
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Manager overview</p>
              <div className="mt-4 space-y-3">
                {portal.managers.map((manager) => (
                  <div key={manager.id} className="panel-muted p-4">
                    <p className="font-semibold">{manager.firstName} {manager.lastName}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{manager.title || "Property Manager"}</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {portal.scope.properties.filter((property) => property.managerId === manager.id).length} assigned properties
                    </p>
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
