"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type InviteDetails = {
  tenantEmail: string;
  expiresAt: string;
  lease: {
    property:
      | { name: string; addressLine1: string; addressLine2?: string | null; city: string; state: string; postalCode: string; country?: string | null; formattedAddress: string }
      | null;
    unit: { unitNumber: string } | null;
    formattedAddress: string;
    manager: { name: string; email: string; phone: string | null } | null;
    startDate: string | null;
    endDate: string | null;
    monthlyRent: number | null;
    securityDeposit: number | null;
  };
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

export function InviteAcceptance({
  token,
  invite,
  userEmail
}: {
  token: string;
  invite: InviteDetails;
  userEmail?: string | null;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function acceptInvite() {
    setIsPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/tenant-invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Could not accept invite.");
      }

      setMessage("Invite accepted. Your tenant dashboard is now connected.");
      window.location.href = "/dashboard";
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept invite.");
    } finally {
      setIsPending(false);
    }
  }

  const matchingUser = userEmail && userEmail.toLowerCase() === invite.tenantEmail.toLowerCase();

  return (
    <Card className="mx-auto max-w-2xl p-6 lg:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Tenant invite</p>
      <h1 className="mt-3 text-3xl font-semibold">Connect to your lease</h1>
      <div className="panel-muted mt-6 space-y-3 p-5 text-sm">
        <p><span className="font-semibold">Tenant email:</span> {invite.tenantEmail}</p>
        <p><span className="font-semibold">Manager:</span> {invite.lease.manager?.name ?? "Manager"} ({invite.lease.manager?.email ?? "No email"})</p>
        <p><span className="font-semibold">Property:</span> {invite.lease.property?.name ?? "Property"} {invite.lease.unit?.unitNumber ? `Unit ${invite.lease.unit.unitNumber}` : ""}</p>
        <p><span className="font-semibold">Address:</span> {invite.lease.formattedAddress}</p>
        <p><span className="font-semibold">Lease dates:</span> {formatDate(invite.lease.startDate)} to {formatDate(invite.lease.endDate)}</p>
        <p><span className="font-semibold">Rent:</span> {formatCurrency(invite.lease.monthlyRent)} / <span className="font-semibold">Deposit:</span> {formatCurrency(invite.lease.securityDeposit)}</p>
        <p><span className="font-semibold">Expires:</span> {formatDate(invite.expiresAt)}</p>
      </div>

      {!userEmail ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/login?invite=${encodeURIComponent(token)}`}>
            <Button>Log in to accept</Button>
          </Link>
          <Link href={`/signup?invite=${encodeURIComponent(token)}`}>
            <Button variant="secondary">Create tenant account</Button>
          </Link>
        </div>
      ) : !matchingUser ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This invite is for {invite.tenantEmail}. You are signed in as {userEmail}. Log out and sign in with the invited email to accept.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
          <Button onClick={() => void acceptInvite()} disabled={isPending}>
            {isPending ? "Accepting..." : "Accept invite"}
          </Button>
        </div>
      )}
    </Card>
  );
}
