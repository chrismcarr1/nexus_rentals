import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteLeaseAction, releaseLeaseUnitAction, updateLeaseAction } from "@/lib/actions";
import { formatUnitAddress } from "@/lib/address";
import { formatRentDueTime, toDateInputValue } from "@/lib/app-time";
import { requireRoles } from "@/lib/auth";
import { documentDownloadHref, documentTypeLabel, getFileDisplayName } from "@/lib/document-metadata";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { parseLateFeePolicy } from "@/lib/lease-payment-scheduler";
import { getLeaseBilling } from "@/lib/payment-charge";
import { UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

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
  const safeDocumentPath = isAllowedStoredAssetPath(lease.documentPath, { allowDemo: true }) ? lease.documentPath : undefined;
  const blockingStatuses = new Set(["ACTIVE", "UPCOMING", "active", "invited", "draft"]);
  const hasAnotherReservation = Boolean(
    unit && portal.scope.leases.some((item) => item.id !== lease.id && item.unitId === unit.id && blockingStatuses.has(item.status))
  );
  const unitAvailable = Boolean(
    unit && ["VACANT", "TURNOVER"].includes(unit.occupancyStatus) && !hasAnotherReservation
  );
  const leaseCanBeReleased = Boolean(unit && blockingStatuses.has(lease.status));
  const existingLateFeePolicy = parseLateFeePolicy(lease.lateFeePolicy);
  const leaseBilling = getLeaseBilling(lease);
  const leaseFiles = portal.scope.files
    .filter((file) => file.leaseId === lease.id && isAllowedStoredAssetPath(file.path, { allowDemo: true }))
    .sort((a, b) => (b.uploadedAt ?? b.createdAt).localeCompare(a.uploadedAt ?? a.createdAt));
  const currentLeaseDocument = leaseFiles.find(
    (file) => file.kind === "LEASE_DOCUMENT" && (!safeDocumentPath || file.path === safeDocumentPath)
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manage lease"
        title={`${property?.name ?? "Property"} ${unit?.unitNumber ?? ""}`.trim()}
        description="Update lease terms, tenant assignment, status, document storage, or remove the lease from the tracker."
        actions={
          <Link href="/leases" className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]/30">
            Back to leases
          </Link>
        }
      />

      {query.error === "invalid-lease" ? (
        <div className="page-alert page-alert-warning">
          Review the lease details and make sure the required fields are complete.
        </div>
      ) : null}

      {query.moveIn === "created" ? (
        <div className="page-alert page-alert-success">
          New move-in created successfully.{" "}
          {query.invite === "sent"
            ? "A fresh tenant setup link was emailed to the address on the lease."
            : query.invite === "failed"
              ? `The move-in was created, but the tenant invite email failed${query.inviteError ? `: ${query.inviteError}` : "."}`
              : "Portal invite was skipped for now."}
        </div>
      ) : null}

      {query.released === "1" ? (
        <div className="page-alert page-alert-success">
          The lease was closed and the unit availability was recalculated. It can now be used for a new move-in unless another lease reserves it.
        </div>
      ) : null}

      <div className="content-split-tight">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Lease record</p>
              <h2 className="mt-2 text-2xl font-semibold">{tenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`).join(", ") || lease.tenantEmail || "Unassigned tenant"}</h2>
              {property ? <p className="mt-2 text-sm text-[var(--muted)]">{formatUnitAddress(property, unit)}</p> : null}
            </div>
            <Badge>{lease.status}</Badge>
          </div>
          <div className="card-grid-compact mt-5">
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Term</p>
              <p className="mt-2 font-semibold">{formatDateOrUnset(lease.startDate)} to {formatDateOrUnset(lease.endDate)}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Base monthly rent</p>
              <p className="mt-2 font-semibold">{formatCurrency(lease.monthlyRent)}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Tenant-facing rent</p>
              <p className="mt-2 font-semibold">{formatCurrency(leaseBilling.tenantFacingRent)}</p>
              {leaseBilling.managerAbsorbsPaymentCharge ? (
                <p className="mt-1 text-xs text-[var(--muted)]">Manager absorbs $1/month</p>
              ) : null}
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Payment charge</p>
              <p className="mt-2 font-semibold">
                {leaseBilling.managerAbsorbsPaymentCharge ? "Manager absorbed" : "Tenant responsibility"}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {leaseBilling.managerAbsorbsPaymentCharge ? "$1/month manager-absorbed" : "$0 manager-absorbed"}
              </p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Security deposit</p>
              <p className="mt-2 font-semibold">{formatCurrency(lease.securityDeposit)}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Rent schedule</p>
              <p className="mt-2 font-semibold">Day {lease.dueDay} at {formatRentDueTime(lease.rentDueTime)}</p>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm text-[var(--muted)]">Move-in date</p>
              <p className="mt-2 font-semibold">{formatDateOrUnset(lease.moveInDate)}</p>
            </div>
          </div>
          {safeDocumentPath ? (
            <a
              href={currentLeaseDocument ? documentDownloadHref(currentLeaseDocument.id) : safeDocumentPath}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block truncate text-sm font-semibold text-[var(--brand)]"
            >
              Open current lease agreement
            </a>
          ) : null}
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Edit lease</p>
          <form action={updateLeaseAction} className="mt-6 space-y-4">
            <input type="hidden" name="leaseId" value={lease.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="existingDocumentPath" value={safeDocumentPath ?? ""} />
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
            <div className="form-grid-2">
              <input name="startDate" type="date" required defaultValue={toDateInputValue(lease.startDate)} className="field" />
              <input name="endDate" type="date" required defaultValue={toDateInputValue(lease.endDate)} className="field" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <input name="monthlyRent" type="number" min="0" step="0.01" required defaultValue={lease.monthlyRent} placeholder="Monthly rent" className="field" />
              <input name="dueDay" type="number" min="1" max="28" required defaultValue={lease.dueDay} placeholder="Due day" className="field" />
              <input name="rentDueTime" type="time" required defaultValue={lease.rentDueTime ?? "09:00"} className="field" />
              <input name="securityDeposit" type="number" min="0" step="0.01" required defaultValue={lease.securityDeposit} placeholder="Deposit" className="field" />
            </div>
            <textarea name="recurringCharges" defaultValue={lease.recurringCharges ?? ""} placeholder="Recurring charges" className="field min-h-24" />
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--text)]">Late fee rule</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <select name="lateFeeType" className="field" defaultValue={existingLateFeePolicy?.feeType ?? "fixed"}>
                  <option value="fixed">Fixed ($)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                <input name="lateFeeAmount" type="number" min="0" step="0.01" defaultValue={existingLateFeePolicy?.amount ?? ""} placeholder="Amount" className="field" />
                <input name="lateFeeGraceDays" type="number" min="0" max="30" defaultValue={existingLateFeePolicy?.graceDays ?? 5} placeholder="Grace days" className="field" />
              </div>
            </div>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Lease documents</p>
            <h2 className="mt-2 text-xl font-semibold">Agreements and tenant ID</h2>
          </div>
          <Badge>{leaseFiles.length} files</Badge>
        </div>
        {leaseFiles.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {leaseFiles.map((file) => (
              <a
                key={file.id}
                href={documentDownloadHref(file.id)}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--brand)]">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{getFileDisplayName(file)}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">{documentTypeLabel(file.kind)}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">No documents are indexed for this lease yet.</p>
        )}
      </Card>

      {unit ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Unit availability</p>
          {unitAvailable ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Unit {unit.unitNumber} is available</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">The unit is vacant or in turnover and has no active reservation.</p>
              </div>
              <Link
                href={`/move-ins/new?propertyId=${encodeURIComponent(unit.propertyId)}&unitId=${encodeURIComponent(unit.id)}`}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
              >
                Start new move-in
              </Link>
            </div>
          ) : leaseCanBeReleased ? (
            <>
              <h2 className="mt-3 text-xl font-semibold">End this lease and release Unit {unit.unitNumber}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                This preserves the lease and tenant history, revokes any pending invite, and recalculates the unit so it can be selected for a future move-in.
              </p>
              <form action={releaseLeaseUnitAction} className="mt-5 space-y-4">
                <input type="hidden" name="leaseId" value={lease.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
                  <input type="checkbox" name="confirmRelease" value="yes" required className="mt-1" />
                  <span>I confirm this tenancy has ended and the unit should be released for another move-in.</span>
                </label>
                <SubmitButton pendingLabel="Releasing unit...">End lease and release unit</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-xl font-semibold">Unit {unit.unitNumber} has another reservation</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Review the unit record before starting another move-in.</p>
            </>
          )}
        </Card>
      ) : null}

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
