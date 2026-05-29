"use client";

import { Ban, Copy, Mail, Plus, RefreshCw } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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

function StatusMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <p className="text-[11px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-[var(--text)]">
      <span>{children}</span>
      {hint ? <span className="text-xs font-normal text-[var(--muted)]">{hint}</span> : null}
    </span>
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

  async function refreshLeases() {
    const response = await fetch("/api/leases/manager", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not refresh leases.");
    setLeases(payload.leases ?? []);
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

  const pendingInvites = leases.filter((lease) => lease.inviteStatus === "pending").length;
  const connectedTenants = leases.filter((lease) => lease.tenantConnected).length;
  const activeLeases = leases.filter((lease) => lease.status === "active").length;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col items-stretch gap-4">
          <SectionHeader
            eyebrow="Workspace status"
            title="Tenant invite pipeline"
            description="Keep lease records, delivery fallbacks, and account connections visible without leaving this workspace."
            className="flex-1"
          />
          <div className="grid w-full grid-cols-1 gap-2">
            <StatusMetric label="Leases" value={leases.length} />
            <StatusMetric label="Invites" value={pendingInvites} />
            <StatusMetric label="Connections" value={connectedTenants} />
          </div>
        </div>

        {error || message ? (
          <div className="mt-4 grid gap-2">
            {error ? <p className="rounded-md border border-red-300/20 bg-red-400/10 px-3 py-2.5 text-sm text-red-200">{error}</p> : null}
            {message ? <p className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200">{message}</p> : null}
          </div>
        ) : null}

        {manualInviteUrl ? (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
            <div className="flex flex-col items-stretch gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Manual invite link</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Email delivery is unavailable. Copy this secure link and send it to the tenant directly.</p>
              </div>
              <Badge>Delivery fallback</Badge>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Input readOnly value={manualInviteUrl} className="font-mono text-xs" />
              <Button type="button" variant="secondary" className="gap-2" onClick={() => void copyManualInviteLink()}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="content-split">
        <Card className="p-6">
          <SectionHeader
            eyebrow="Create lease"
            title="New tenant connection"
            description="Select the property context, add the tenant email, and create the lease record before sending the invite."
          />
          {!properties.length ? (
            <div className="mt-5 rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--panel)] p-6 text-center">
              <h3 className="text-base font-semibold text-[var(--text)]">Add a property first</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Create or assign a property to your manager account before inviting tenants.</p>
            </div>
          ) : (
            <form onSubmit={(event) => void createLease(event)} className="mt-6 space-y-5">
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
                  <span className="mt-2 block rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                    {selectedProperty.formattedAddress}
                  </span>
                ) : null}
              </label>

              <div className="form-grid-2">
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

              <div className="form-grid-2">
                <label className="block">
                  <FieldLabel hint="Optional">Start date</FieldLabel>
                  <Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
                <label className="block">
                  <FieldLabel hint="Optional">End date</FieldLabel>
                  <Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
                </label>
              </div>

              <div className="form-grid-2">
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

              <div className="flex flex-col items-stretch gap-3 border-t border-[var(--line)] pt-5">
                <p className="text-xs leading-5 text-[var(--muted)]">After creation, send or resend the tenant invite from the operations table.</p>
                <Button type="submit" disabled={pendingAction === "create"} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {pendingAction === "create" ? "Creating..." : "Create lease"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--line)] p-6">
            <SectionHeader
              eyebrow="Tenant connections"
              title="Leases and invites"
              description={`${activeLeases} active leases, ${pendingInvites} pending invites, and ${connectedTenants} connected tenants.`}
              actions={
                <Button type="button" variant="secondary" className="gap-2" onClick={() => void refreshLeases()}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              }
            />
          </div>

          {leases.length ? (
            <div className="data-table-scroll">
              <table className="responsive-table min-w-[58rem] text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--panel)] text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Tenant</th>
                    <th className="px-5 py-3 font-semibold">Lease ID</th>
                    <th className="px-5 py-3 font-semibold">Property</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Term</th>
                    <th className="px-5 py-3 font-semibold">Rent</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {leases.map((lease) => {
                    const canSend = lease.inviteStatus !== "accepted" && lease.status !== "active";
                    const canRevoke = lease.inviteStatus === "pending";

                    return (
                      <tr key={lease.id} className="align-top transition hover:bg-[var(--panel)]">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[var(--text)]">{lease.tenantEmail}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{lease.tenantConnected ? "Connected tenant" : "Not connected yet"}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-mono text-xs font-semibold text-[var(--text)]">{lease.nexusLeaseId ?? lease.id}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[var(--text)]">{lease.property?.name ?? "Property"}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{lease.unit?.unitNumber ? `Unit ${lease.unit.unitNumber}` : "No unit assigned"}</p>
                          <p className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted)]">{lease.formattedAddress}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={leaseTone(lease.status)}>{humanizeStatus(lease.status)}</Badge>
                            <Badge tone={inviteTone(lease.inviteStatus)}>{humanizeStatus(lease.inviteStatus)}</Badge>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)]">
                          {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-[var(--text)]">{formatCurrency(lease.monthlyRent)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {canSend ? (
                              <Button type="button" variant="secondary" className="min-h-9 gap-2 px-3 py-1.5" disabled={pendingAction === `send-${lease.id}`} onClick={() => void sendInvite(lease.id)}>
                                <Mail className="h-4 w-4" />
                                {lease.inviteStatus === "not sent" ? "Send" : "Resend"}
                              </Button>
                            ) : null}
                            {canRevoke ? (
                              <Button type="button" variant="ghost" className="min-h-9 gap-2 px-3 py-1.5" disabled={pendingAction === `revoke-${lease.id}`} onClick={() => void revokeInvite(lease.id)}>
                                <Ban className="h-4 w-4" />
                                Revoke
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6">
              <div className="rounded-md border border-dashed border-[var(--line-strong)] bg-[var(--panel)] p-8 text-center">
                <h3 className="text-base font-semibold text-[var(--text)]">No leases yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Create a lease with a tenant email, then send an invite to connect the tenant account.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
