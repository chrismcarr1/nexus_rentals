import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteLeaseAction, updateLeaseAction } from "@/lib/actions";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateOrUnset(value?: string | Date | null) {
  return value ? formatDate(value) : "Not set";
}

export default async function ManageLeasePage({
  params,
  searchParams
}: {
  params: Promise<{ leaseId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { leaseId } = await params;
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const query = (await searchParams) ?? {};
  const lease = portal.scope.leases.find((item) => item.id === leaseId);

  if (!lease) notFound();

  const unit = portal.scope.units.find((item) => item.id === lease.unitId);
  const property = portal.scope.properties.find((item) => item.id === (lease.propertyId ?? unit?.propertyId)) ?? null;
  const tenants = portal.scope.tenants.filter((tenant) => lease.tenantIds.includes(tenant.id));
  const returnTo = `/leases/${lease.id}`;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manage lease"
        title={`${property?.name ?? "Property"} ${unit?.unitNumber ?? ""}`.trim()}
        description="Update lease terms, tenant assignment, status, document storage, or remove the lease from the tracker."
        actions={
          <Link href="/leases" className="rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]/30">
            Back to leases
          </Link>
        }
      />

      {query.error === "invalid-lease" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Review the lease details and make sure the required fields are complete.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Lease record</p>
              <h2 className="mt-2 text-2xl font-semibold">{tenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`).join(", ") || lease.tenantEmail || "Unassigned tenant"}</h2>
            </div>
            <Badge>{lease.status}</Badge>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm text-[var(--muted)]">Term</p>
              <p className="mt-2 font-semibold">{formatDateOrUnset(lease.startDate)} to {formatDateOrUnset(lease.endDate)}</p>
            </div>
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm text-[var(--muted)]">Monthly rent</p>
              <p className="mt-2 font-semibold">{formatCurrency(lease.monthlyRent)}</p>
            </div>
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm text-[var(--muted)]">Security deposit</p>
              <p className="mt-2 font-semibold">{formatCurrency(lease.securityDeposit)}</p>
            </div>
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm text-[var(--muted)]">Due day</p>
              <p className="mt-2 font-semibold">Day {lease.dueDay}</p>
            </div>
          </div>
          {lease.documentPath ? (
            <a href={lease.documentPath} target="_blank" rel="noreferrer" className="mt-5 block truncate text-sm font-semibold text-[var(--brand)]">
              Open current lease agreement
            </a>
          ) : null}
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Edit lease</p>
          <form action={updateLeaseAction} className="mt-6 space-y-4">
            <input type="hidden" name="leaseId" value={lease.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="existingDocumentPath" value={lease.documentPath ?? ""} />
            <select name="unitId" className="field" required defaultValue={lease.unitId ?? ""}>
              <option value="" disabled>Select unit</option>
              {portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
              })}
            </select>
            <select name="tenantId" className="field" required defaultValue={lease.tenantIds[0] ?? ""}>
              <option value="" disabled>Select tenant</option>
              {portal.scope.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.firstName} {tenant.lastName}</option>)}
            </select>
            <div className="grid gap-4 md:grid-cols-2">
              <input name="startDate" type="date" required defaultValue={toDateInputValue(lease.startDate)} className="field" />
              <input name="endDate" type="date" required defaultValue={toDateInputValue(lease.endDate)} className="field" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <input name="monthlyRent" type="number" min="0" step="0.01" required defaultValue={lease.monthlyRent} placeholder="Monthly rent" className="field" />
              <input name="dueDay" type="number" min="1" max="28" required defaultValue={lease.dueDay} placeholder="Due day" className="field" />
              <input name="securityDeposit" type="number" min="0" step="0.01" required defaultValue={lease.securityDeposit} placeholder="Deposit" className="field" />
            </div>
            <textarea name="recurringCharges" defaultValue={lease.recurringCharges ?? ""} placeholder="Recurring charges" className="field min-h-24" />
            <input name="lateFeePolicy" defaultValue={lease.lateFeePolicy ?? ""} placeholder="Late fee policy" className="field" />
            <textarea name="notes" defaultValue={lease.notes ?? ""} placeholder="Notes" className="field min-h-24" />
            <SingleUploadInput name="documentPath" label="Replace lease agreement" accept=".pdf,.doc,.docx,image/*" />
            <select name="status" className="field" required defaultValue={lease.status}>
              <option value="ACTIVE">Active</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
            </select>
            <SubmitButton pendingLabel="Saving lease...">Save lease</SubmitButton>
          </form>
        </Card>
      </div>

      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--danger)]">Delete lease</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          This removes the lease from the tracker and clears its link from related payments and inspections.
        </p>
        <form action={deleteLeaseAction} className="mt-5 space-y-4">
          <input type="hidden" name="leaseId" value={lease.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
            <input type="checkbox" name="confirmDelete" value="yes" required className="mt-1" />
            <span>I understand this cannot be undone.</span>
          </label>
          <SubmitButton variant="danger" pendingLabel="Deleting lease...">Delete lease</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
