"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Landmark, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ScreeningSummary } from "@/lib/screening/types";
import { formatDate } from "@/lib/utils";

function statusTone(status?: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED" || status === "EXPIRED") return "danger" as const;
  return "warning" as const;
}

function recommendationLabel(value: ScreeningSummary["recommendation"]["recommendation"]) {
  if (value === "approved") return "Lower risk";
  if (value === "high_risk") return "Elevated risk";
  return "Needs review";
}

export function ManagerScreeningDashboard({
  applicationId,
  initialSummary,
  checkrConfigured = true,
  plaidConfigured = true
}: {
  applicationId: string;
  initialSummary: ScreeningSummary;
  checkrConfigured?: boolean;
  plaidConfigured?: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [isPending, startTransition] = useTransition();
  const checkrRequest = summary.requests.find((request) => request.provider === "CHECKR");
  const plaidRequest = summary.requests.find((request) => request.provider === "PLAID");
  const plaidActive = Boolean(plaidRequest && !["FAILED", "EXPIRED"].includes(plaidRequest.status));

  function run(path: string, successNotice?: string) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const response = await fetch(path, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "Screening could not be started.");
        return;
      }
      setSummary(payload);
      if (successNotice) setNotice(successNotice);
    });
  }

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-kicker">Automated screening</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Background, identity, and income</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Checkr and Plaid return structured information for your review. Nexus never makes the final rental decision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !checkrConfigured || Boolean(checkrRequest && !["FAILED", "EXPIRED"].includes(checkrRequest.status))}
            onClick={() => run(`/api/applications/${applicationId}/screening/checkr/start`, "Background check requested.")}
          >
            <ShieldCheck className="h-4 w-4" />
            Request background check
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !plaidConfigured}
            onClick={() => run(`/api/applications/${applicationId}/screening/plaid/start`, plaidActive ? "Bank verification invite re-sent to the applicant." : "Bank verification requested. The applicant received an email invite.")}
          >
            <Landmark className="h-4 w-4" />
            {plaidActive ? "Resend bank verification invite" : "Request bank verification"}
          </Button>
          <Button
            type="button"
            disabled={isPending || (!checkrConfigured && !plaidConfigured)}
            onClick={() => run(`/api/applications/${applicationId}/screening/start`, "Full screening requested.")}
          >
            {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Run full screening
          </Button>
        </div>
      </div>

      {!checkrConfigured ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Checkr is not configured. Add CHECKR_API_KEY and CHECKR_PACKAGE_SLUG (or enable CHECKR_MOCK_MODE) to enable background checks.</span>
        </div>
      ) : null}
      {!plaidConfigured ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV (or enable PLAID_MOCK_MODE) to enable bank/income verification.</span>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-md border border-red-600/15 bg-red-600/10 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="mt-4 rounded-md border border-emerald-600/15 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text)]">Checkr background</p>
            <Badge tone={statusTone(checkrRequest?.status)}>{checkrRequest?.status.replaceAll("_", " ") ?? "Not started"}</Badge>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {summary.checkr?.result ? `Disposition: ${summary.checkr.result}` : "Candidate invitation and report status."}
          </p>
          {checkrRequest?.errorMessage ? <p className="mt-2 text-xs leading-5 text-red-700">{checkrRequest.errorMessage}</p> : null}
          {checkrRequest ? <p className="mt-2 text-xs text-[var(--muted)]">Updated {formatDate(checkrRequest.updatedAt)}</p> : null}
          {summary.checkrInvitationUrl ? (
            <a
              href={summary.checkrInvitationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Checkr invitation link
            </a>
          ) : null}
        </div>
        <div className="rounded-md border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text)]">Plaid verification</p>
            <Badge tone={statusTone(plaidRequest?.status)}>{plaidRequest?.status.replaceAll("_", " ") ?? "Not started"}</Badge>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {summary.plaid?.verifiedMonthlyIncome
              ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(summary.plaid.verifiedMonthlyIncome)} verified monthly income`
              : "Applicant-controlled identity and income connection."}
          </p>
          {summary.plaid ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {summary.plaid.identityVerified ? "Identity verified" : "Identity not verified yet"} - {summary.plaid.accountCount} account{summary.plaid.accountCount === 1 ? "" : "s"} connected
            </p>
          ) : null}
          {plaidRequest?.errorMessage ? <p className="mt-2 text-xs leading-5 text-red-700">{plaidRequest.errorMessage}</p> : null}
          {plaidRequest ? <p className="mt-2 text-xs text-[var(--muted)]">Updated {formatDate(plaidRequest.updatedAt)}</p> : null}
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text)]">Risk recommendation</p>
            <Badge tone={summary.recommendation.recommendation === "approved" ? "success" : summary.recommendation.recommendation === "high_risk" ? "danger" : "warning"}>
              {recommendationLabel(summary.recommendation.recommendation)}
            </Badge>
          </div>
          <p className="mt-3 text-2xl font-semibold text-[var(--text)]">{summary.recommendation.riskScore}<span className="text-sm text-[var(--muted)]"> / 100 risk</span></p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="max-w-3xl text-xs leading-5 text-[var(--muted)]">{summary.recommendation.disclaimer}</p>
        <Button type="button" variant="ghost" onClick={() => setShowReport((value) => !value)}>
          <ExternalLink className="h-4 w-4" />
          {showReport ? "Hide report" : "View report"}
        </Button>
      </div>

      {showReport ? (
        <div className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Recommendation reasons</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              {summary.recommendation.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Risk flags</p>
            <div className="mt-3 space-y-2">
              {summary.recommendation.riskFlags.length ? summary.recommendation.riskFlags.map((flag, index) => (
                <div key={`${flag.code}-${index}`} className="flex items-start gap-2 rounded-md border border-[var(--line)] bg-white p-3 text-sm text-[var(--muted)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <span>{flag.message}</span>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No risk flags have been produced.</p>}
            </div>
          </div>
        </div>
      ) : null}

      {(summary.mockMode.checkr || summary.mockMode.plaid) ? (
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
          Mock provider mode: {summary.mockMode.checkr ? "Checkr " : ""}{summary.mockMode.plaid ? "Plaid" : ""}
        </p>
      ) : null}
    </Card>
  );
}
