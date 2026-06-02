"use client";

import {
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  Home,
  Mail,
  Plus,
  RefreshCw,
  UserCheck,
  type LucideIcon
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  tenantConnected: boolean;
  property: PropertyOption | null;
  unit: { id: string; unitNumber: string } | null;
  formattedAddress: string;
  status: string;
  inviteStatus: string;
  startDate: string | null;
  endDate: string | null;
  monthlyRent: number | null;
  securityDeposit: number | null;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function formatCurrency(value: number | null) {
  if (value == null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function inviteTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "accepted") return "success";
  if (status === "pending") return "warning";
  if (status === "expired" || status === "revoked") return "danger";
  return "default";
}

function leaseTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "invited" || status === "draft") return "warning";
  if (status === "ended" || status === "cancelled") return "danger";
  return "default";
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function formatTerm(lease: LeaseRow) {
  return `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`;
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
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
    securityDeposit: ""
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualInviteUrl, setManualInviteUrl] = useState("");
  const [pendingAction, setPendingAction] = useState("");

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === selectedPropertyId), [selectedPropertyId, units]);
  const selectedProperty = useMemo(() => properties.find((property) => property.id === selectedPropertyId) ?? null, [properties, selectedPropertyId]);
  const pendingInvites = leases.filter((lease) => lease.inviteStatus === "pending").length;
  const connectedTenants = leases.filter((lease) => lease.tenantConnected).length;
  const activeLeases = leases.filter((lease) => lease.status === "active").length;
  const endingSoon = leases.filter((lease) => {
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
          securityDeposit: form.securityDeposit ? Number(form.securityDeposit) : undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create lease.");

      setLeases((current) => [payload.lease, ...current.filter((lease) => lease.id !== payload.lease.id)]);
      setForm({ tenantEmail: "", unitId: "", startDate: "", endDate: "", monthlyRent: "", securityDeposit: "" });
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
      if (payload.inviteUrl && !payload.emailSent) {
        setManualInviteUrl(payload.inviteUrl);
        setMessage("Email delivery is unavailable, but the tenant invite link is ready to share.");
      } else {
        setMessage("Tenant invite sent.");
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
      await navigator.clipboard.writeText(manualInviteUrl);
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
            <Button type="button" variant="secondary" className="w-full md:w-auto" disabled={pendingAction === "refresh"} onClick={() => void refreshWithFeedback()}>
              <RefreshCw className={cn("h-4 w-4", pendingAction === "refresh" && "animate-spin")} />
              {pendingAction === "refresh" ? "Refreshing" : "Refresh"}
            </Button>
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
                Email delivery is unavailable. Copy this secure link and send it to the tenant directly.
              </p>
            </div>
            <Badge tone="warning">Copy required</Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Input readOnly value={manualInviteUrl} className="font-mono text-xs" />
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
              title="Connections and invite status"
              description={`${connectedTenants} connected tenants, ${pendingInvites} pending invites, ${endingSoon} renewals to watch.`}
            />
          </div>

          {leases.length ? (
            <div className="divide-y divide-[var(--line)]">
              {leases.map((lease) => {
                const canSend = lease.inviteStatus !== "accepted" && lease.status !== "active";
                const canRevoke = lease.inviteStatus === "pending";
                const daysLeft = daysUntil(lease.endDate);

                return (
                  <article key={lease.id} className="bg-white p-5 transition hover:bg-[var(--surface)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--muted-strong)]">
                            {lease.nexusLeaseId ?? lease.id}
                          </span>
                          <Badge tone={leaseTone(lease.status)}>{humanizeStatus(lease.status)}</Badge>
                          <Badge tone={inviteTone(lease.inviteStatus)}>{humanizeStatus(lease.inviteStatus)}</Badge>
                        </div>
                        <h3 className="mt-3 truncate text-lg font-semibold text-[var(--text)]">{lease.tenantEmail || "Tenant email missing"}</h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                          {lease.property?.name ?? "Property"}{lease.unit?.unitNumber ? ` - Unit ${lease.unit.unitNumber}` : " - No unit assigned"}
                        </p>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{lease.formattedAddress}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {canSend ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-9 px-3 py-1.5"
                            disabled={pendingAction === `send-${lease.id}`}
                            onClick={() => void sendInvite(lease.id)}
                          >
                            <Mail className="h-4 w-4" />
                            {pendingAction === `send-${lease.id}` ? "Sending" : lease.inviteStatus === "not sent" ? "Send invite" : "Resend"}
                          </Button>
                        ) : null}
                        {canRevoke ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-9 px-3 py-1.5"
                            disabled={pendingAction === `revoke-${lease.id}`}
                            onClick={() => void revokeInvite(lease.id)}
                          >
                            <Ban className="h-4 w-4" />
                            {pendingAction === `revoke-${lease.id}` ? "Revoking" : "Revoke"}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
                      <InfoLine label="Term" value={formatTerm(lease)} />
                      <InfoLine label="Rent" value={formatCurrency(lease.monthlyRent)} />
                      <InfoLine label="Deposit" value={formatCurrency(lease.securityDeposit)} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Connection</p>
                        <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                          {lease.tenantConnected ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : <UserCheck className="h-4 w-4 text-[var(--muted)]" />}
                          {lease.tenantConnected ? "Tenant connected" : "Waiting for tenant"}
                        </p>
                      </div>
                    </div>

                    {daysLeft != null && daysLeft >= 0 && daysLeft <= 60 ? (
                      <div className="mt-4 rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2 text-sm font-medium text-amber-800">
                        Renewal watch: lease ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}.
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center">
                <FileText className="mx-auto h-7 w-7 text-[var(--brand)]" />
                <h3 className="mt-3 text-base font-semibold text-[var(--text)]">No leases yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                  Create a lease with a tenant email, then send an invite to connect the tenant account.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
