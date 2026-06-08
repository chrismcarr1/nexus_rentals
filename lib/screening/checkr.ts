import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getCheckrConfig } from "@/lib/screening/config";
import type {
  NormalizedCheckrResult,
  ScreeningApplicationRecord
} from "@/lib/screening/types";

type CheckrCandidate = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

type CheckrInvitation = {
  id: string;
  status?: string;
  invitation_url?: string;
  report_id?: string;
};

function basicAuth(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function checkrRequest<T>(path: string, init?: RequestInit) {
  const config = getCheckrConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuth(config.apiKey || ""),
      "Content-Type": "application/x-www-form-urlencoded",
      ...init?.headers
    },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Checkr request failed with status ${response.status}.`);
  }
  return payload;
}

export async function createCheckrCandidate(application: ScreeningApplicationRecord) {
  const config = getCheckrConfig();
  if (config.mock) {
    return {
      id: `mock_candidate_${application.id}`,
      first_name: application.applicantFirstName,
      last_name: application.applicantLastName,
      email: application.applicantEmail
    } satisfies CheckrCandidate;
  }

  const body = new URLSearchParams({
    first_name: application.applicantFirstName,
    last_name: application.applicantLastName,
    email: application.applicantEmail
  });
  return checkrRequest<CheckrCandidate>("/candidates", { method: "POST", body });
}

export async function createCheckrInvitation(candidateId: string, application: ScreeningApplicationRecord) {
  const config = getCheckrConfig();
  if (config.mock) {
    return {
      id: `mock_invitation_${application.id}`,
      status: "completed",
      invitation_url: `https://checkr.example.test/invitations/${application.id}`,
      report_id: `mock_report_${application.id}`
    } satisfies CheckrInvitation;
  }

  const state = String(application.metadata.propertyState ?? "").trim();
  const city = String(application.metadata.propertyCity ?? "").trim();
  const country = String(application.metadata.propertyCountry ?? "US").trim() || "US";
  if (country === "US" && !state) {
    throw new Error("The rental property state is required to create a Checkr invitation.");
  }
  const body = new URLSearchParams({
    candidate_id: candidateId,
    package: config.packageSlug,
    "work_locations[][country]": country,
    ...(state ? { "work_locations[][state]": state } : {}),
    ...(city ? { "work_locations[][city]": city } : {})
  });
  return checkrRequest<CheckrInvitation>("/invitations", { method: "POST", body });
}

export async function getCheckrReport(reportId: string) {
  const config = getCheckrConfig();
  if (config.mock) {
    return {
      id: reportId,
      status: "complete",
      result: "clear",
      adjudication: null,
      assessment: null,
      completed_at: new Date().toISOString()
    };
  }
  return checkrRequest<Record<string, any>>(`/reports/${encodeURIComponent(reportId)}`, { method: "GET" });
}

export function normalizeCheckrReport(report: Record<string, any>): NormalizedCheckrResult {
  const rawStatus = String(report.status ?? "").toLowerCase();
  const status =
    rawStatus === "complete"
      ? "COMPLETED"
      : rawStatus === "suspended"
        ? "IN_PROGRESS"
        : rawStatus === "pending"
          ? "IN_PROGRESS"
          : rawStatus === "failed"
            ? "FAILED"
            : "PENDING";
  const result = ["clear", "consider", "suspended"].includes(String(report.result).toLowerCase())
    ? String(report.result).toLowerCase()
    : "unknown";
  const searches = Array.isArray(report.searches) ? report.searches : [];

  return {
    provider: "CHECKR",
    status,
    reportId: report.id,
    result: result as NormalizedCheckrResult["result"],
    adjudication: report.adjudication ?? null,
    assessment: report.assessment ?? null,
    completedAt: report.completed_at ?? null,
    findings: searches.slice(0, 50).map((search: any) => ({
      category: String(search.type ?? search.object ?? "search"),
      status: String(search.status ?? "unknown"),
      label: String(search.result ?? search.status ?? "unknown")
    }))
  };
}

export function verifyCheckrWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.CHECKR_WEBHOOK_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CHECKR_WEBHOOK_SECRET is required in production.");
    }
    return true;
  }
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/i, "");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
