import { CalendarDays, FileText, Home, Mail, Phone, ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { LeaseConnectionManager } from "@/components/lease-connection-manager";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatAddress, formatUnitAddress } from "@/lib/address";
import { requireUser } from "@/lib/auth";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { getManagerLeaseRows } from "@/lib/lease-connections";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | null) {
  return value ? formatDate(value) : "Not set";
}

function formatCurrencyOrUnset(value?: number | null) {
  return value == null ? "Not set" : formatCurrency(value);
}

function leaseStatusTone(status?: string | null): "default" | "success" | "warning" | "danger" {
  if (status === "ACTIVE" || status === "active") return "success";
  if (status === "UPCOMING" || status === "draft" || status === "invited") return "warning";
  if (status === "EXPIRED" || status === "TERMINATED" || status === "ended" || status === "cancelled") return "danger";
  return "default";
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function LeaseMetric({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
          <p className="mt-2 truncate text-lg font-semibold text-[var(--text)]">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] text-[var(--brand)]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-t border-[var(--line)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

export default async function LeasesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};

  if (user.role === "TENANT") {
    const currentManager = portal.currentLease?.managerUserId
      ? portal.managers.find((manager) => manager.id === portal.currentLease?.managerUserId) ?? null
      : null;
    const leaseDocuments = portal.currentLease?.documentPath && isAllowedStoredAssetPath(portal.currentLease.documentPath, { allowDemo: true })
      ? [
          {
            id: `${portal.currentLease.id}-agreement`,
            label: "Lease agreement",
            kind: "LEASE_DOCUMENT",
            path: portal.currentLease.documentPath
          }
        ]
      : [];
    const documents = [...leaseDocuments, ...portal.documents].filter((file) => isAllowedStoredAssetPath(file.path, { allowDemo: true }));
    const leaseDaysRemaining = daysUntil(portal.currentLease?.endDate);

    return (
      <div className="space-y-4">
        {!portal.currentLease || !portal.currentProperty ? (
          <EmptyState title="No active lease connected yet" description="Open your manager's invite link and accept it with this tenant account to connect your lease." />
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="border-b border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="section-kicker">My lease</p>
                    <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">
                      {portal.currentProperty.name}
                      {portal.currentUnit?.unitNumber ? ` Unit ${portal.currentUnit.unitNumber}` : ""}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">{formatUnitAddress(portal.currentProperty, portal.currentUnit)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={leaseStatusTone(portal.currentLease.status)}>{portal.currentLease.status}</Badge>
                    {leaseDaysRemaining != null && leaseDaysRemaining >= 0 ? <Badge>{leaseDaysRemaining} days left</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <LeaseMetric
                  label="Monthly rent"
                  value={formatCurrencyOrUnset(portal.currentLease.monthlyRent)}
                  detail={`Due day ${portal.currentLease.dueDay} of each month`}
                  icon={<Wallet className="h-4 w-4" />}
                />
                <LeaseMetric
                  label="Lease term"
                  value={`${formatDateOrUnset(portal.currentLease.startDate)} to ${formatDateOrUnset(portal.currentLease.endDate)}`}
                  detail="Current agreement dates"
                  icon={<CalendarDays className="h-4 w-4" />}
                />
                <LeaseMetric
                  label="Deposit"
                  value={formatCurrencyOrUnset(portal.currentLease.securityDeposit)}
                  detail="Security deposit on record"
                  icon={<ShieldCheck className="h-4 w-4" />}
                />
                <LeaseMetric
                  label="Home"
                  value={portal.currentUnit?.unitNumber ? `Unit ${portal.currentUnit.unitNumber}` : "Assigned home"}
                  detail={portal.currentProperty.name}
                  icon={<Home className="h-4 w-4" />}
                />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
              <Card className="p-5">
                <p className="section-kicker">Lease details</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Terms and billing notes</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <DetailRow label="Recurring charges" value={portal.currentLease.recurringCharges || "None listed"} />
                  <DetailRow label="Late fee policy" value={portal.currentLease.lateFeePolicy || "Refer to management for policy details"} />
                  <DetailRow label="Lease status" value={portal.currentLease.status} />
                  <DetailRow label="Property address" value={formatUnitAddress(portal.currentProperty, portal.currentUnit)} />
                </div>
              </Card>

              <Card className="p-5">
                <p className="section-kicker">Manager contact</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{currentManager ? `${currentManager.firstName} ${currentManager.lastName}` : "Property manager"}</h2>
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <Mail className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                    <span className="break-all">{currentManager?.email ?? "Manager contact will appear after the invite is accepted."}</span>
                  </p>
                  {currentManager?.phone ? (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                      <Phone className="h-4 w-4 text-[var(--brand)]" />
                      {currentManager.phone}
                    </p>
                  ) : null}
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="section-kicker">Documents</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Lease files</h2>
                </div>
                <p className="text-sm text-[var(--muted)]">{documents.length} available</p>
              </div>
              {documents.length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {documents.map((file) => (
                    <a
                      key={file.id}
                      href={file.path}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-hover)]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[rgba(13,143,123,0.18)] bg-white text-[var(--brand)]">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">{file.label || file.kind}</span>
                        <span className="mt-1 block text-xs font-medium text-[var(--brand)]">Open document</span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState title="No lease documents uploaded" description="Documents can be added later by management without changing the resident experience." />
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    );
  }

  const initialLeases = await getManagerLeaseRows(user);

  return (
    <div className="space-y-4">
      {params.error === "invalid-lease" ? (
        <div className="rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">
          Review the lease details before creating a tenant invite.
        </div>
      ) : null}
      <LeaseConnectionManager
        properties={portal.scope.properties.map((property) => ({
          id: property.id,
          name: property.name,
          addressLine1: property.addressLine1,
          addressLine2: property.addressLine2,
          city: property.city,
          state: property.state,
          postalCode: property.postalCode,
          country: property.country,
          formattedAddress: formatAddress(property)
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
