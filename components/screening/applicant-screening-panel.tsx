"use client";

import Script from "next/script";
import { useState, useTransition } from "react";
import { Building2, CheckCircle2, ExternalLink, Landmark, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

declare global {
  interface Window {
    Plaid?: {
      create(options: {
        token: string;
        onSuccess(publicToken: string): void;
        onExit(error: unknown): void;
      }): { open(): void };
    };
  }
}

type ApplicantStatus = {
  requests: Array<{ provider: "CHECKR" | "PLAID"; status: string; updatedAt: string }>;
  checkrInvitationUrl?: string | null;
  plaid: { status: string; identityVerified: boolean; incomeVerified: boolean } | null;
};

export function ApplicantScreeningPanel({
  applicationId,
  applicantName,
  propertyLabel,
  initialStatus
}: {
  applicationId: string;
  applicantName: string;
  propertyLabel: string;
  initialStatus: ApplicantStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const plaidRequest = status.requests.find((request) => request.provider === "PLAID");
  const checkrRequest = status.requests.find((request) => request.provider === "CHECKR");

  async function refresh() {
    const response = await fetch(`/api/applications/${applicationId}/screening/status`);
    if (response.ok) {
      const data = await response.json();
      setStatus((prev) => ({ ...prev, ...data }));
    }
  }

  function exchange(publicToken: string) {
    startTransition(async () => {
      const response = await fetch(`/api/applications/${applicationId}/screening/plaid/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Plaid verification could not be completed.");
        return;
      }
      await refresh();
    });
  }

  function connect() {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/applications/${applicationId}/screening/plaid/link-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentAccepted: consent })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Plaid Link could not be opened.");
        return;
      }
      if (payload.mock) {
        exchange("mock-public-token");
        return;
      }
      if (!window.Plaid) {
        setError("Plaid Link is still loading. Try again in a moment.");
        return;
      }
      window.Plaid.create({
        token: payload.linkToken,
        onSuccess: exchange,
        onExit: (plaidError) => {
          if (plaidError) setError("Plaid Link closed before verification finished.");
        }
      }).open();
    });
  }

  return (
    <>
      <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" />
      <div className="space-y-4">
        <Card className="p-5 lg:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="section-kicker">Nexus applicant screening</p>
              <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">Welcome, {applicantName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Review and complete screening requested for {propertyLabel}. You control whether to connect a financial account.
              </p>
            </div>
            <Badge tone="warning">Landlord decision required</Badge>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--brand)]" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)]">Background screening</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Checkr securely collects the information and authorization needed for a background report.
                </p>
                <div className="mt-3"><Badge tone={checkrRequest?.status === "COMPLETED" ? "success" : "warning"}>{checkrRequest?.status.replaceAll("_", " ") ?? "Not requested"}</Badge></div>
                {status.checkrInvitationUrl && checkrRequest && !["COMPLETED", "FAILED", "EXPIRED"].includes(checkrRequest.status) ? (
                  <a
                    href={status.checkrInvitationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Complete background check
                  </a>
                ) : null}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Landmark className="mt-0.5 h-5 w-5 text-[var(--brand)]" />
              <div>
                <p className="font-semibold text-[var(--text)]">Identity and income</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Plaid verifies account ownership and summarizes income. Nexus never receives your bank username or password.
                </p>
                <div className="mt-3"><Badge tone={plaidRequest?.status === "COMPLETED" ? "success" : "warning"}>{plaidRequest?.status.replaceAll("_", " ") ?? "Not requested"}</Badge></div>
              </div>
            </div>
          </Card>
        </div>

        {plaidRequest && plaidRequest.status !== "COMPLETED" ? (
          <Card className="p-5 lg:p-6">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-[var(--brand)]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-[var(--text)]">Connect a financial account</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  This connection is voluntary. Plaid sends Nexus a limited identity and income summary for this application. It does not give the property manager access to your bank account.
                </p>
                <label className="mt-4 flex items-start gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
                  <span>I consent to Plaid retrieving and sharing identity and income verification data for this rental application.</span>
                </label>
                {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
                <Button type="button" className="mt-4" disabled={!consent || isPending} onClick={connect}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                  Connect with Plaid
                </Button>
              </div>
            </div>
          </Card>
        ) : status.plaid?.status === "COMPLETED" ? (
          <Card className="border-emerald-600/20 bg-emerald-600/5 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <div>
                <p className="font-semibold text-emerald-900">Plaid verification complete</p>
                <p className="mt-1 text-sm text-emerald-800">The property manager can now review the verification summary.</p>
              </div>
            </div>
          </Card>
        ) : null}

        <p className="px-1 text-xs leading-5 text-[var(--muted)]">
          Nexus organizes screening information but does not make rental decisions. Contact the property manager for selection criteria, report disputes, adverse-action notices, or accommodation requests.
        </p>
      </div>
    </>
  );
}
