"use client";

import Link from "next/link";
import {
  Ban,
  Building2,
  CalendarClock,
  Copy,
  FileText,
  Home,
  Mail,
  Plus,
  RefreshCw,
  type LucideIcon
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { DataTable } from "@/components/data-table";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DEFAULT_RENT_DUE_TIME, differenceInAppCalendarDays, formatRentDueTime, formatShortAppDate, getAppDateKey } from "@/lib/app-time";
import { cn } from "@/lib/utils";

type PropertyOption = {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
  formattedAddress: string;
};

type UnitOption = {
  id: string;
  propertyId: string;
  unitNumber: string;
};

type LeaseRow = {
  id: string;
  nexusLeaseId?: string;
  tenantEmail: string;
  tenantFirstName?: string | null;
  tenantLastName?: string | null;
  tenantConnected: boolean;
  property: PropertyOption | null;
  unit: { id: string; unitNumber: string } | null;
  formattedAddress: string;
  status: string;
  inviteStatus: string;
  startDate: string | null;
  endDate: string | null;
  monthlyRent: number | null;
  dueDay: number;
  rentDueTime?: string | null;
  securityDeposit: number | null;
  createdAt: string;
  updatedAt: string;
};

function formatShortDate(value: string | null) {
  return formatShortAppDate(value);
}

function formatCurrency(value: number | null) {
  if (value == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function combinedLeaseStatus(lease: LeaseRow) {
  if (leaseIsPast(lease.status)) {
    return { label: humanizeStatus(lease.status), detail: "Past lease", tone: "danger" as const };
  }
  if (lease.tenantConnected && lease.status === "active") {
    return { label: "Active", detail: "Tenant connected", tone: "success" as const };
  }
  if (lease.tenantConnected) {
    return { label: humanizeStatus(lease.status), detail: "Tenant connected", tone: leaseTone(lease.status) };
  }
  if (lease.inviteStatus === "pending" || lease.status === "invited") {
    return { label: "Invited", detail: "Waiting for tenant", tone: "warning" as const };
  }
  if (lease.inviteStatus === "expired") {
    return { label: "Invite expired", detail: humanizeStatus(lease.status), tone: "danger" as const };
  }
  if (lease.inviteStatus === "revoked") {
    return { label: "Invite revoked", detail: humanizeStatus(lease.status), tone: "danger" as const };
  }
  if (lease.status === "draft" || lease.inviteStatus === "not sent") {
    return { label: "Draft", detail: "Invite not sent", tone: "default" as const };
  }
  return { label: humanizeStatus(lease.status), detail: humanizeStatus(lease.inviteStatus), tone: leaseTone(lease.status) };
}

function leaseTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "upcoming" || status === "invited" || status === "draft") return "warning";
  if (leaseIsPast(status)) return "danger";
  return "default";
}

function leaseIsPast(status: string) {
  return status === "expired" || status === "terminated" || status === "cancelled";
}

function humanizeStatus(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function daysUntil(value: string | null) {
  if (!value) return null;
  return differenceInAppCalendarDays(value, getAppDateKey());
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">
      <span>{children}</span>
      {hint ? <span className="text-xs font-medium text-[var(--muted)]">{hint}</span> : null}
    </span>
  );
}

function MetricTile({
  label,
  value,
  detail,
  Icon,
  tone = "brand"
}: {
  label: string;
  value: string | number;
  detail: string;
  Icon: LucideIcon;
  tone?: "brand" | "blue" | "success" | "warning";
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{value}</p>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
            tone === "brand" && "border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] text-[var(--brand)]",
            tone === "blue" && "border-[rgba(49,92,207,0.16)] bg-[var(--accent-blue)] text-[var(--brand-2)]",
            tone === "success" && "border-emerald-600/15 bg-emerald-600/10 text-emerald-700",
            tone === "warning" && "border-amber-600/18 bg-amber-500/12 text-amber-800"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        tone === "success" && "border-emerald-600/15 bg-emerald-600/10 text-emerald-800",
        tone === "danger" && "border-red-600/15 bg-red-600/10 text-red-700"
      )}
    >
      {children}
    </p>
  );
}

export function LeaseConnectionManager({
  properties,
  units,
  initialLeases
}: {
  properties: PropertyOption[];
  units: UnitOption[];
  initialLeases: LeaseRow[];
}) {
  const [leases, setLeases] = useState(initialLeases);
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const [form, setForm] = useState({
    tenantEmail: "",
    unitId: "",
    startDate: "",
    endDate: "",
    monthlyRent: "",
    dueDay: "1",
    rentDueTime: DEFAULT_RENT_DUE_TIME,
    securityDeposit: ""
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualInviteUrl, setManualInviteUrl] = useState("");
  const manualInviteInputId = useId();
  const [pendingAction, setPendingAction] = useState("");

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === selectedPropertyId), [selectedPropertyId, units]);
  const selectedProperty = useMemo(() => properties.find((property) => property.id === selectedPropertyId) ?? null, [properties, selectedPropertyId]);
  const currentLeases = leases.filter((lease) => !leaseIsPast(lease.status));
  const pastLeases = leases.filter((lease) => leaseIsPast(lease.status));
  const pendingInvites = currentLeases.filter((lease) => lease.inviteStatus === "pending").length;
  const connectedTenants = currentLeases.filter((lease) => lease.tenantConnected).length;
  const activeLeases = currentLeases.filter((lease) => lease.status === "active").length;
  const endingSoon = currentLeases.filter((lease) => {
    const days = daysUntil(lease.endDate);
    return lease.status === "active" && days != null && days >= 0 && days <= 60;
  }).length;

  async function refreshLeases() {
    const response = await fetch("/api/leases/manager", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not refresh leases.");
    setLeases(payload.leases ?? []);
  }

  async function refreshWithFeedback() {
    setError("");
    setMessage("");
    setPendingAction("refresh");

    try {
      await refreshLeases();
      setMessage("Lease board refreshed.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh leases.");
    } finally {
      setPendingAction("");
    }
  }

  async function createLease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setManualInviteUrl("");
    setPendingAction("create");

    try {
      const response = await fetch("/api/leases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          unitId: form.unitId || undefined,
          tenantEmail: form.tenantEmail,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          monthlyRent: form.monthlyRent ? Number(form.monthlyRent) : undefined,
          dueDay: form.dueDay ? Number(form.dueDay) : undefined,
          rentDueTime: form.rentDueTime || DEFAULT_RENT_DUE_TIME,
          securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create lease.");

      setLeases((current) => [payload.lease, ...current.filter((lease) => lease.id !== payload.lease.id)]);
      setForm({ tenantEmail: "", unitId: "", startDate: "", endDate: "", monthlyRent: "", dueDay: "1", rentDueTime: DEFAULT_RENT_DUE_TIME, securityDeposit: "" });
      setMessage("Lease created. Send the tenant invite when you are ready.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create lease.");
    } finally {
      setPendingAction("");
    }
  }

  async function sendInvite(leaseId: string) {
    setError("");
    setMessage("");
    setManualInviteUrl("");
    setPendingAction(`send-${leaseId}`);

    try {
      const response = await fetch("/api/tenant-invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not send invite.");

      await refreshLeases();
      if (payload.inviteUrl) {
        setManualInviteUrl(payload.inviteUrl);
        setMessage(
          payload.emailSent
            ? "Tenant invite email was requested, and the invite link is ready to copy."
            : payload.emailError
              ? `Email delivery is unavailable: ${payload.emailError} The tenant invite link is ready to share.`
              : "Email delivery is unavailable, but the tenant invite link is ready to share."
        );
      } else {
        setMessage(payload.emailSent ? "Tenant invite email was requested." : payload.emailError ? `Tenant invite created, but email delivery is unavailable: ${payload.emailError}` : "Tenant invite created.");
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send invite.");
    } finally {
      setPendingAction("");
    }
  }

  async function revokeInvite(leaseId: string) {
    setError("");
    setMessage("");
    setManualInviteUrl("");
    setPendingAction(`revoke-${leaseId}`);

    try {
      const response = await fetch("/api/tenant-invites/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not revoke invite.");

      await refreshLeases();
      setMessage("Tenant invite revoked.");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke invite.");
    } finally {
      setPendingAction("");
    }
  }

  async function copyManualInviteLink() {
    if (!manualInviteUrl) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(manualInviteUrl);
      } else {
        const input = document.getElementById(manualInviteInputId);
        if (!(input instanceof HTMLInputElement)) throw new Error("Copy input not found.");
        input.select();
        document.execCommand("copy");
      }
      setMessage("Invite link copied. Send it to the tenant from your email, text, or messaging app.");
    } catch {
      setError("Could not copy the invite link automatically. Select and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              eyebrow="Lease command center"
              title="Portfolio lease board"
              description="Create lease records, send tenant invites, and watch account connections from one focused workspace."
            />
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <Link href="/move-ins/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(13,143,123,0.18)] transition hover:bg-[var(--brand-strong)]">
                <Plus className="h-4 w-4" />
                New Move-In
              </Link>
              <Button type="button" variant="secondary" className="w-full md:w-auto" disabled={pendingAction === "refresh"} onClick={() => void refreshWithFeedback()}>
                <RefreshCw className={cn("h-4 w-4", pendingAction === "refresh" && "animate-spin")} />
                {pendingAction === "refresh" ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Leases" value={leases.length} detail="Total lease records in scope" Icon={FileText} />
          <MetricTile label="Active" value={activeLeases} detail="Tenancies currently connected to operations" Icon={Home} tone="success" />
          <MetricTile label="Pending invites" value={pendingInvites} detail="Tenants still need to accept access" Icon={Mail} tone="warning" />
          <MetricTile label="Renewal watch" value={endingSoon} detail="Active leases ending within 60 days" Icon={CalendarClock} tone="blue" />
        </div>
      </Card>

      {error || message ? (
        <div className="grid gap-2">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {message ? <Notice tone="success">{message}</Notice> : null}
        </div>
      ) : null}

      {manualInviteUrl ? (
        <Card className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="section-kicker">Delivery fallback</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Manual invite link</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Copy this secure link and send it to the tenant directly by text, email, or message.
              </p>
            </div>
            <Badge tone="warning">Copy ready</Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Input id={manualInviteInputId} readOnly value={manualInviteUrl} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="secondary" onClick={() => void copyManualInviteLink()}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <Card className="p-5">
          <SectionHeader
            eyebrow="Create lease"
            title="New tenant connection"
            description="Choose the property, enter the tenant email, then create the record before sending access."
          />
          {!properties.length ? (
            <div className="mt-5 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center">
              <Building2 className="mx-auto h-6 w-6 text-[var(--brand)]" />
              <h3 className="mt-3 text-base font-semibold text-[var(--text)]">Add a property first</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                Create or assign a property to your manager account before inviting tenants.
              </p>
            </div>
          ) : (
            <form onSubmit={(event) => void createLease(event)} className="mt-5 space-y-4">
              <label className="block">
                <FieldLabel>Property</FieldLabel>
                <Select
                  required
                  value={selectedPropertyId}
                  onChange={(event) => {
                    setSelectedPropertyId(event.target.value);
                    setForm((current) => ({ ...current, unitId: "" }));
                  }}
                >
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </Select>
                {selectedProperty ? (
                  <span className="mt-2 block rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                    {selectedProperty.formattedAddress}
                  </span>
                ) : null}
              </label>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block">
                  <FieldLabel hint="Optional">Unit</FieldLabel>
                  <Select value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))}>
                    <option value="">Whole property or unassigned</option>
                    {propertyUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        Unit {unit.unitNumber}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <FieldLabel>Tenant email</FieldLabel>
                  <Input
                    type="email"
                    required
                    value={form.tenantEmail}
                    onChange={(event) => setForm((current) => ({ ...current, tenantEmail: event.target.value }))}
                    placeholder="tenant@example.com"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block">
                  <FieldLabel hint="Optional">Start date</FieldLabel>
                  <Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
                <label className="block">
                  <FieldLabel hint="Optional">End date</FieldLabel>
                  <Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block">
                  <FieldLabel hint="Optional">Monthly rent</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monthlyRent}
                    onChange={(event) => setForm((current) => ({ ...current, monthlyRent: event.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <FieldLabel hint="Optional">Security deposit</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.securityDeposit}
                    onChange={(event) => setForm((current) => ({ ...current, securityDeposit: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block">
                  <FieldLabel>Rent due day</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={form.dueDay}
                    onChange={(event) => setForm((current) => ({ ...current, dueDay: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Rent due time</FieldLabel>
                  <Input
                    type="time"
                    value={form.rentDueTime}
                    onChange={(event) => setForm((current) => ({ ...current, rentDueTime: event.target.value }))}
                  />
                </label>
              </div>

              <div className="border-t border-[var(--line)] pt-4">
                <p className="text-xs leading-5 text-[var(--muted)]">Create the record first. Invite actions appear on each lease row.</p>
                <Button type="submit" disabled={pendingAction === "create"} className="mt-3 w-full">
                  <Plus className="h-4 w-4" />
                  {pendingAction === "create" ? "Creating..." : "Create lease"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] p-5">
            <SectionHeader
              eyebrow="Lease records"
              title="Current leases and invites"
              description={`${currentLeases.length} current records, ${connectedTenants} connected tenants, ${pendingInvites} pending invites, ${endingSoon} renewals to watch.`}
            />
          </div>

          {currentLeases.length ? (
            <DataTable
              className="lease-records-table"
              minWidth="min(52rem, 100%)"
              columns={["Lease", "Tenant", "Property / unit", "Status", "Term", "Financials", ""]}
            >
              {currentLeases.map((lease) => {
                const canSend = lease.inviteStatus !== "accepted" && lease.status !== "active";
                const canRevoke = lease.inviteStatus === "pending";
                const daysLeft = daysUntil(lease.endDate);
                const renewalWatch = daysLeft != null && daysLeft >= 0 && daysLeft <= 60;
                const status = combinedLeaseStatus(lease);
                const tenantHasName = Boolean(lease.tenantFirstName || lease.tenantLastName);

                return (
                  <tr key={lease.id} className="table-row">
                    <td className="table-cell">
                      <Link href={`/leases/${lease.id}`} className="table-link">
                        <span className="inline-flex max-w-full items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--muted-strong)]">
                          <span className="truncate">{lease.nexusLeaseId ?? lease.id}</span>
                        </span>
                        <span className="mt-1.5 block truncate text-xs font-medium text-[var(--muted)]">Lease record</span>
                      </Link>
                    </td>
                    <td className="table-cell">
                      {tenantHasName ? (
                        <>
                          <span className="block truncate text-sm font-semibold text-[var(--text)]">{lease.tenantLastName || "Last name"}</span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{lease.tenantFirstName || "First name"}</span>
                        </>
                      ) : (
                        <>
                          <span className="block truncate text-sm font-semibold text-[var(--text)]">Invited tenant</span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{lease.tenantEmail || "Email not set"}</span>
                        </>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="block truncate text-sm font-medium text-[var(--text)]">{lease.property?.name ?? "Property"}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                        {lease.unit?.unitNumber ? `Unit ${lease.unit.unitNumber}` : "No unit assigned"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="mt-1 block text-xs text-[var(--muted)]">{status.detail}</span>
                    </td>
                    <td className="table-cell">
                      <span className="block truncate text-xs font-medium text-[var(--muted)]">{formatShortDate(lease.startDate)} - {formatShortDate(lease.endDate)}</span>
                      {renewalWatch ? (
                        <span className="mt-1 inline-flex rounded-md border border-amber-600/18 bg-amber-500/12 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {daysLeft}d renewal
                        </span>
                      ) : (
                        <span className="mt-1 block text-xs text-[var(--muted)]">No renewal flag</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="block truncate text-sm font-semibold text-[var(--text)]">{formatCurrency(lease.monthlyRent)}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Day {lease.dueDay} at {formatRentDueTime(lease.rentDueTime)}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Deposit {formatCurrency(lease.securityDeposit)}</span>
                    </td>
                    <td className="table-cell text-right">
                      <RowActionsMenu>
                        <RowActionLink href={`/leases/${lease.id}`}>View</RowActionLink>
                        {lease.unit?.id ? <RowActionLink href={`/units/${lease.unit.id}`}>View unit</RowActionLink> : null}
                        {canSend ? (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={pendingAction === `send-${lease.id}`}
                            onClick={() => void sendInvite(lease.id)}
                          >
                            <Mail className="h-4 w-4 text-[var(--muted)]" />
                            {pendingAction === `send-${lease.id}` ? "Sending..." : lease.inviteStatus === "not sent" ? "Send invite" : "Resend invite"}
                          </button>
                        ) : null}
                        {canRevoke ? (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={pendingAction === `revoke-${lease.id}`}
                            onClick={() => void revokeInvite(lease.id)}
                          >
                            <Ban className="h-4 w-4" />
                            {pendingAction === `revoke-${lease.id}` ? "Revoking..." : "Revoke invite"}
                          </button>
                        ) : null}
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          ) : (
            <div className="p-6">
              <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center">
                <FileText className="mx-auto h-7 w-7 text-[var(--brand)]" />
                <h3 className="mt-3 text-base font-semibold text-[var(--text)]">No current leases</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Create a lease with a tenant email, then send an invite to connect the tenant account. Expired records are kept below.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {pastLeases.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] p-5">
            <SectionHeader
              eyebrow="Past leases"
              title="Expired and closed records"
              description={`${pastLeases.length} past lease${pastLeases.length === 1 ? "" : "s"} kept for reference, reporting, and history.`}
            />
          </div>
          <DataTable
            className="lease-records-table"
            minWidth="min(52rem, 100%)"
            columns={["Lease", "Tenant", "Property / unit", "Status", "Term", "Financials", ""]}
          >
            {pastLeases.map((lease) => {
              const daysLeft = daysUntil(lease.endDate);
              const status = combinedLeaseStatus(lease);
              const tenantHasName = Boolean(lease.tenantFirstName || lease.tenantLastName);

              return (
                <tr key={lease.id} className="table-row">
                  <td className="table-cell">
                    <Link href={`/leases/${lease.id}`} className="table-link">
                      <span className="inline-flex max-w-full items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--muted-strong)]">
                        <span className="truncate">{lease.nexusLeaseId ?? lease.id}</span>
                      </span>
                      <span className="mt-1.5 block truncate text-xs font-medium text-[var(--muted)]">Past lease</span>
                    </Link>
                  </td>
                  <td className="table-cell">
                    {tenantHasName ? (
                      <>
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">{lease.tenantLastName || "Last name"}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{lease.tenantFirstName || "First name"}</span>
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">Past tenant</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{lease.tenantEmail || "Email not set"}</span>
                      </>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">{lease.property?.name ?? "Property"}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                      {lease.unit?.unitNumber ? `Unit ${lease.unit.unitNumber}` : "No unit assigned"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="mt-1 block text-xs text-[var(--muted)]">{status.detail}</span>
                  </td>
                  <td className="table-cell">
                    <span className="block truncate text-xs font-medium text-[var(--muted)]">{formatShortDate(lease.startDate)} - {formatShortDate(lease.endDate)}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      {daysLeft != null && daysLeft < 0 ? `${Math.abs(daysLeft)}d past end` : "Closed lease"}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{formatCurrency(lease.monthlyRent)}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">Deposit {formatCurrency(lease.securityDeposit)}</span>
                  </td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={`/leases/${lease.id}`}>View</RowActionLink>
                      {lease.unit?.id ? <RowActionLink href={`/units/${lease.unit.id}`}>View unit</RowActionLink> : null}
                    </RowActionsMenu>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
      ) : null}
    </div>
  );
}
