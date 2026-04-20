import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createLeaseAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function LeasesPage() {
  const user = await requireUser();
  const portal = await getPortalContext(user);

  if (user.role === "TENANT") {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="My lease"
          title="Lease terms, documents, and home details."
          description="A simplified resident lease view with dates, monthly charges, and access to the most relevant files for your tenancy."
        />
        {!portal.currentLease || !portal.currentUnit || !portal.currentProperty ? (
          <EmptyState title="No active lease on file" description="Your resident account does not currently have an active or upcoming lease attached." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Lease summary</p>
              <h2 className="mt-2 text-2xl font-semibold">{portal.currentProperty.name} {portal.currentUnit.unitNumber}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Term</p>
                  <p className="mt-2 font-semibold">{formatDate(portal.currentLease.startDate)} to {formatDate(portal.currentLease.endDate)}</p>
                </div>
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Monthly rent</p>
                  <p className="mt-2 font-semibold">{formatCurrency(portal.currentLease.monthlyRent)}</p>
                </div>
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Security deposit</p>
                  <p className="mt-2 font-semibold">{formatCurrency(portal.currentLease.securityDeposit)}</p>
                </div>
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Due day</p>
                  <p className="mt-2 font-semibold">Day {portal.currentLease.dueDay} of each month</p>
                </div>
              </div>
              <div className="mt-5 rounded-[24px] border border-[var(--line)] p-4 text-sm leading-7 text-[var(--muted)]">
                <p>Recurring charges: {portal.currentLease.recurringCharges || "None listed"}</p>
                <p>Late fee policy: {portal.currentLease.lateFeePolicy || "Refer to management for policy details"}</p>
                <p>Current lease status: {portal.currentLease.status}</p>
              </div>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Documents and contacts</p>
              <div className="mt-4 space-y-3">
                {portal.documents.length ? portal.documents.map((file) => (
                  <div key={file.id} className="panel-muted rounded-[24px] p-4">
                    <p className="font-semibold">{file.label || file.kind}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{file.path}</p>
                  </div>
                )) : <EmptyState title="No lease documents uploaded" description="Documents can be added later by management without changing the resident experience." />}
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Lease operations"
        title="Leasing activity, renewals, and occupancy risk."
        description="Track active and upcoming leases, monitor upcoming expirations, and create new agreements for units in your current scope."
      />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Lease tracker</p>
          <div className="mt-5 space-y-3">
            {portal.scope.leases.map((lease) => {
              const unit = portal.scope.units.find((item) => item.id === lease.unitId);
              const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;
              const tenants = portal.scope.tenants.filter((tenant) => lease.tenantIds.includes(tenant.id));

              return (
                <div key={lease.id} className="panel-muted rounded-[24px] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{property?.name} {unit?.unitNumber}</p>
                      <p className="text-sm text-[var(--muted)]">{tenants.map((row) => `${row.firstName} ${row.lastName}`).join(", ") || "Unassigned tenant"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(lease.monthlyRent)}</p>
                      <p className="text-sm text-[var(--muted)]">{lease.status}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted)]">{formatDate(lease.startDate)} - {formatDate(lease.endDate)}</p>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Create lease</p>
          <form action={createLeaseAction} className="mt-6 space-y-4">
            <select name="unitId" className="field">
              {portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
              })}
            </select>
            <select name="tenantId" className="field">
              {portal.scope.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>)}
            </select>
            <div className="grid gap-4 md:grid-cols-2">
              <input name="startDate" type="date" className="field" />
              <input name="endDate" type="date" className="field" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <input name="monthlyRent" type="number" step="0.01" placeholder="Monthly rent" className="field" />
              <input name="dueDay" type="number" placeholder="Due day" className="field" />
              <input name="securityDeposit" type="number" step="0.01" placeholder="Deposit" className="field" />
            </div>
            <textarea name="recurringCharges" placeholder="Recurring charges" className="field min-h-24" />
            <input name="lateFeePolicy" placeholder="Late fee policy" className="field" />
            <select name="status" className="field">
              <option value="ACTIVE">Active</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
            </select>
            <SubmitButton>Create lease</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
