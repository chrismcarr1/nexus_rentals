import { EmptyState } from "@/components/empty-state";
import { LeaseConnectionManager } from "@/components/lease-connection-manager";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getManagerLeaseRows } from "@/lib/lease-connections";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | null) {
  return value ? formatDate(value) : "Not set";
}

function formatCurrencyOrUnset(value?: number | null) {
  return value == null ? "Not set" : formatCurrency(value);
}

export default async function LeasesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};

  if (user.role === "TENANT") {
    const currentManager = portal.currentLease?.managerUserId
      ? portal.managers.find((manager) => manager.id === portal.currentLease?.managerUserId) ?? null
      : null;
    const leaseDocuments = portal.currentLease?.documentPath
      ? [
          {
            id: `${portal.currentLease.id}-agreement`,
            label: "Lease agreement",
            kind: "LEASE_DOCUMENT",
            path: portal.currentLease.documentPath
          }
        ]
      : [];
    const documents = [...leaseDocuments, ...portal.documents];

    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="My lease"
          title="Lease terms, documents, and home details."
          description="A simplified resident lease view with dates, monthly charges, and access to the most relevant files for your tenancy."
        />
        {!portal.currentLease || !portal.currentProperty ? (
          <EmptyState title="No active lease connected yet" description="Open your manager's invite link and accept it with this tenant account to connect your lease." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Lease summary</p>
              <h2 className="mt-2 text-2xl font-semibold">
                {portal.currentProperty.name}
                {portal.currentUnit?.unitNumber ? ` ${portal.currentUnit.unitNumber}` : ""}
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Term</p>
                  <p className="mt-2 font-semibold">{formatDateOrUnset(portal.currentLease.startDate)} to {formatDateOrUnset(portal.currentLease.endDate)}</p>
                </div>
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Monthly rent</p>
                  <p className="mt-2 font-semibold">{formatCurrencyOrUnset(portal.currentLease.monthlyRent)}</p>
                </div>
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="text-sm text-[var(--muted)]">Security deposit</p>
                  <p className="mt-2 font-semibold">{formatCurrencyOrUnset(portal.currentLease.securityDeposit)}</p>
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
                <div className="panel-muted rounded-[24px] p-4">
                  <p className="font-semibold">{currentManager ? `${currentManager.firstName} ${currentManager.lastName}` : "Property manager"}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{currentManager?.email ?? "Manager contact will appear after the invite is accepted."}</p>
                  {currentManager?.phone ? <p className="mt-1 text-sm text-[var(--muted)]">{currentManager.phone}</p> : null}
                </div>
                {documents.length ? documents.map((file) => (
                  <div key={file.id} className="panel-muted rounded-[24px] p-4">
                    <p className="font-semibold">{file.label || file.kind}</p>
                    <a href={file.path} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm font-medium text-[var(--brand)]">
                      Open document
                    </a>
                  </div>
                )) : <EmptyState title="No lease documents uploaded" description="Documents can be added later by management without changing the resident experience." />}
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  const initialLeases = await getManagerLeaseRows(user);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Lease operations"
        title="Create leases, invite tenants, and track connections."
        description="Start a lease with a tenant email, send a secure invite, and see when the tenant account connects to the correct property or unit."
      />
      {params.error === "invalid-lease" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Review the lease details before creating a tenant invite.
        </div>
      ) : null}
      <LeaseConnectionManager
        properties={portal.scope.properties.map((property) => ({
          id: property.id,
          name: property.name,
          addressLine1: property.addressLine1,
          city: property.city,
          state: property.state,
          postalCode: property.postalCode
        }))}
        units={portal.scope.units.map((unit) => ({
          id: unit.id,
          propertyId: unit.propertyId,
          unitNumber: unit.unitNumber
        }))}
        initialLeases={initialLeases}
      />
    </div>
  );
}
