"use client";

import { Ban, Mail, Plus, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PropertyOption = {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

type UnitOption = {
  id: string;
  propertyId: string;
  unitNumber: string;
};

type LeaseRow = {
  id: string;
  tenantEmail: string;
  tenantConnected: boolean;
  property: PropertyOption | null;
  unit: { id: string; unitNumber: string } | null;
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
  const [pendingAction, setPendingAction] = useState("");

  const propertyUnits = useMemo(() => units.filter((unit) => unit.propertyId === selectedPropertyId), [selectedPropertyId, units]);

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
      setMessage("Tenant invite sent.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send invite.");
    } finally {
      setPendingAction("");
    }
  }

  async function revokeInvite(leaseId: string) {
    setError("");
    setMessage("");
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

  return (
    <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Create lease</p>
        {!properties.length ? (
          <EmptyState title="Add a property first" description="Create or assign a property to your manager account before inviting tenants." />
        ) : (
          <form onSubmit={(event) => void createLease(event)} className="mt-6 space-y-4">
            {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Property</span>
              <select
                className="field"
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
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Unit</span>
              <select className="field" value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))}>
                <option value="">Whole property or unit not assigned</option>
                {propertyUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Tenant email</span>
              <input
                className="field"
                type="email"
                required
                value={form.tenantEmail}
                onChange={(event) => setForm((current) => ({ ...current, tenantEmail: event.target.value }))}
                placeholder="tenant@example.com"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Start date</span>
                <input className="field" type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">End date</span>
                <input className="field" type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Monthly rent</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyRent}
                  onChange={(event) => setForm((current) => ({ ...current, monthlyRent: event.target.value }))}
                  placeholder="0"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Security deposit</span>
                <input
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.securityDeposit}
                  onChange={(event) => setForm((current) => ({ ...current, securityDeposit: event.target.value }))}
                  placeholder="0"
                />
              </label>
            </div>
            <Button type="submit" disabled={pendingAction === "create"} className="gap-2">
              <Plus className="h-4 w-4" />
              {pendingAction === "create" ? "Creating..." : "Create lease"}
            </Button>
          </form>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Tenant connections</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Leases and invites</h2>
          </div>
          <Button type="button" variant="secondary" className="gap-2" onClick={() => void refreshLeases()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          {leases.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                <tr>
                  <th className="py-3 pr-4 font-semibold">Tenant</th>
                  <th className="py-3 pr-4 font-semibold">Property</th>
                  <th className="py-3 pr-4 font-semibold">Status</th>
                  <th className="py-3 pr-4 font-semibold">Term</th>
                  <th className="py-3 pr-4 font-semibold">Rent</th>
                  <th className="py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {leases.map((lease) => {
                  const canSend = lease.inviteStatus !== "accepted" && lease.status !== "active";
                  const canRevoke = lease.inviteStatus === "pending";

                  return (
                    <tr key={lease.id} className="align-top">
                      <td className="py-4 pr-4">
                        <p className="font-semibold">{lease.tenantEmail}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{lease.tenantConnected ? "Connected tenant" : "Not connected yet"}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold">{lease.property?.name ?? "Property"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{lease.unit?.unitNumber ? `Unit ${lease.unit.unitNumber}` : "No unit assigned"}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={leaseTone(lease.status)}>{lease.status}</Badge>
                          <Badge tone={inviteTone(lease.inviteStatus)}>{lease.inviteStatus}</Badge>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-[var(--muted)]">
                        {formatDate(lease.startDate)} to {formatDate(lease.endDate)}
                      </td>
                      <td className="py-4 pr-4 font-semibold">{formatCurrency(lease.monthlyRent)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          {canSend ? (
                            <Button type="button" variant="secondary" className="gap-2" disabled={pendingAction === `send-${lease.id}`} onClick={() => void sendInvite(lease.id)}>
                              <Mail className="h-4 w-4" />
                              {lease.inviteStatus === "not sent" ? "Send" : "Resend"}
                            </Button>
                          ) : null}
                          {canRevoke ? (
                            <Button type="button" variant="ghost" className="gap-2" disabled={pendingAction === `revoke-${lease.id}`} onClick={() => void revokeInvite(lease.id)}>
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
          ) : (
            <EmptyState title="No leases yet" description="Create a lease with a tenant email, then send an invite to connect the tenant account." />
          )}
        </div>
      </Card>
    </div>
  );
}
