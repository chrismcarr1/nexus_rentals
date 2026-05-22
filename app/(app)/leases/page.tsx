import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SingleUploadInput } from "@/components/upload-inputs";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createLeaseAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function LeasesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const canCreateLease = portal.scope.units.length > 0 && portal.scope.tenants.length > 0;

  if (user.role === "TENANT") {
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
                <div key={lease.id} className="panel-muted relative rounded-[24px] p-4 pr-14">
                  <details className="absolute right-3 top-3">
                    <summary
                      aria-label="Lease actions"
                      className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--muted)] transition hover:text-[var(--text)] [&::-webkit-details-marker]:hidden"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </summary>
                    <div className="absolute right-0 z-10 mt-2 w-44 rounded-2xl border border-[var(--line)] bg-white p-1 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                      <Link href={`/leases/${lease.id}`} className="block rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--panel)]">
                        Manage lease
                      </Link>
                    </div>
                  </details>
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
                  {lease.documentPath ? (
                    <a href={lease.documentPath} target="_blank" rel="noreferrer" className="mt-3 block truncate text-sm font-medium text-[var(--brand)]">
                      View lease agreement
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Create lease</p>
          {params.error === "invalid-lease" ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Choose a unit, tenant, lease dates, rent amount, due day, and deposit before creating the lease.
            </div>
          ) : null}
          {!canCreateLease ? (
            <EmptyState title="Need a unit and tenant first" description="Create at least one unit and one tenant in your scope before adding a lease." />
          ) : (
            <form action={createLeaseAction} className="mt-6 space-y-4">
              <select name="unitId" className="field" required defaultValue="">
                <option value="" disabled>Select unit</option>
                {portal.scope.units.map((unit) => {
                  const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                  return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
                })}
              </select>
              <select name="tenantId" className="field" required defaultValue="">
                <option value="" disabled>Select tenant</option>
                {portal.scope.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>)}
              </select>
              <div className="grid gap-4 md:grid-cols-2">
                <input name="startDate" type="date" required className="field" />
                <input name="endDate" type="date" required className="field" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <input name="monthlyRent" type="number" min="0" step="0.01" required placeholder="Monthly rent" className="field" />
                <input name="dueDay" type="number" min="1" max="28" required placeholder="Due day" className="field" />
                <input name="securityDeposit" type="number" min="0" step="0.01" required placeholder="Deposit" className="field" />
              </div>
              <textarea name="recurringCharges" placeholder="Recurring charges" className="field min-h-24" />
              <input name="lateFeePolicy" placeholder="Late fee policy" className="field" />
              <SingleUploadInput name="documentPath" label="Upload lease agreement" accept=".pdf,.doc,.docx,image/*" />
              <select name="status" className="field" required defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="EXPIRED">Expired</option>
                <option value="TERMINATED">Terminated</option>
              </select>
              <SubmitButton>Create lease</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
