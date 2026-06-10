import "server-only";

import { buildAppUrl } from "@/lib/request-origin";
import { sendScreeningInviteEmail } from "@/lib/email";
import {
  getApplicationAddressLabel,
  getSubmissionBundle,
  primaryApplicant
} from "@/lib/applications";
import { readStore, type User } from "@/lib/store";
import {
  createCheckrCandidate,
  createCheckrInvitation,
  getCheckrReport,
  normalizeCheckrReport
} from "@/lib/screening/checkr";
import { getCheckrConfig, getRiskScoringRules, getScreeningMockMode } from "@/lib/screening/config";
import { encryptProviderToken } from "@/lib/screening/crypto";
import {
  createScreeningRequest,
  getCheckrCandidate,
  getLatestRequest,
  getNormalizedResults,
  getScreeningApplication,
  listScreeningRequests,
  rotateApplicantAccess,
  saveCheckrCandidate,
  saveCheckrReport,
  savePlaidVerification,
  saveScreeningResult,
  updateScreeningRequest,
  upsertScreeningApplication
} from "@/lib/screening/repository";
import { scoreTenantScreening } from "@/lib/screening/riskScoring";
import type {
  ScreeningApplicationRecord,
  ScreeningSummary
} from "@/lib/screening/types";

export async function provisionScreeningApplication(submissionId: string) {
  const store = await readStore();
  const bundle = getSubmissionBundle(store, submissionId);
  if (!bundle) throw new Error("Application submission not found.");
  const applicant = primaryApplicant(bundle.applicants);
  if (!applicant) throw new Error("Primary applicant not found.");
  const applicantUser = store.users.find((user) => user.email.toLowerCase() === applicant.email.toLowerCase());
  const property = store.properties.find((item) => item.id === bundle.application.propertyId);

  return upsertScreeningApplication({
    id: bundle.submission.id,
    sourceApplicationId: bundle.application.id,
    submissionId: bundle.submission.id,
    applicantUserId: applicantUser?.id,
    applicantEmail: applicant.email,
    applicantFirstName: applicant.firstName,
    applicantLastName: applicant.lastName,
    propertyId: bundle.application.propertyId,
    unitId: bundle.application.unitId,
    landlordUserId: bundle.application.managerUserId,
    organizationId: bundle.application.organizationId,
    monthlyRent: bundle.application.monthlyRent,
    statedMonthlyIncome: bundle.submission.monthlyIncome,
    status: bundle.submission.status,
    metadata: {
      applicationTitle: bundle.application.title,
      submittedAt: bundle.submission.submittedAt,
      authorizationAccepted: bundle.submission.authorizationAccepted,
      propertyCity: property?.city,
      propertyState: property?.state,
      propertyCountry: property?.country || "US"
    }
  });
}

export async function resolveScreeningApplication(id: string) {
  const existing = await getScreeningApplication(id);
  if (existing) return existing;

  const store = await readStore();
  if (store.applicationSubmissions.some((submission) => submission.id === id)) {
    return provisionScreeningApplication(id);
  }
  const submissions = store.applicationSubmissions
    .filter((submission) => submission.applicationId === id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (submissions.length === 1) return provisionScreeningApplication(submissions[0].id);
  if (submissions.length > 1) {
    throw new Error("This application has multiple submissions. Use the applicant submission ID for screening.");
  }
  throw new Error("Application submission not found.");
}

export async function assertManagerScreeningAccess(application: ScreeningApplicationRecord, user: User) {
  if (user.role !== "MANAGER" || application.landlordUserId !== user.id) {
    throw new Error("You do not have access to this screening record.");
  }
}

export async function getScreeningSummary(id: string): Promise<ScreeningSummary> {
  const application = await resolveScreeningApplication(id);
  const [requests, results, checkrCandidate] = await Promise.all([
    listScreeningRequests(application.id),
    getNormalizedResults(application.id),
    getCheckrCandidate(application.id)
  ]);
  const mockMode = getScreeningMockMode();
  const checkrRequest = requests.find((r) => r.provider === "CHECKR");
  const invitationUrl =
    checkrCandidate?.invitation_url &&
    checkrRequest &&
    !["COMPLETED", "FAILED", "EXPIRED"].includes(checkrRequest.status)
      ? String(checkrCandidate.invitation_url)
      : null;
  return {
    application,
    requests,
    checkr: results.checkr,
    plaid: results.plaid,
    checkrInvitationUrl: invitationUrl,
    recommendation: scoreTenantScreening({
      monthlyRent: application.monthlyRent,
      statedMonthlyIncome: application.statedMonthlyIncome,
      checkr: results.checkr,
      plaid: results.plaid
    }, getRiskScoringRules()),
    applicantPortalReady: Boolean(requests.find((request) => request.provider === "PLAID")),
    mockMode
  };
}

export async function startCheckrScreening(application: ScreeningApplicationRecord) {
  const existing = await getLatestRequest(application.id, "CHECKR");
  if (existing && !["FAILED", "EXPIRED"].includes(existing.status)) return existing;

  const request = await createScreeningRequest({
    application,
    provider: "CHECKR",
    screeningKind: "background_check",
    status: "PENDING"
  });

  try {
    const candidate = await createCheckrCandidate(application);
    const invitation = await createCheckrInvitation(candidate.id, application);
    await saveCheckrCandidate({
      applicationId: application.id,
      requestId: request.id,
      candidateId: candidate.id,
      invitationId: invitation.id,
      invitationStatus: invitation.status,
      invitationUrl: invitation.invitation_url ?? null
    });
    const updated = await updateScreeningRequest(request.id, {
      status: invitation.report_id ? "IN_PROGRESS" : "INVITED",
      providerRequestId: invitation.report_id || invitation.id,
      metadata: { candidateId: candidate.id, invitationId: invitation.id }
    });

    if (invitation.report_id && getCheckrConfig().mock) {
      const report = await getCheckrReport(invitation.report_id);
      const normalized = normalizeCheckrReport(report);
      await saveCheckrReport({
        applicationId: application.id,
        requestId: request.id,
        candidateId: candidate.id,
        reportId: invitation.report_id,
        status: String(report.status ?? "complete"),
        result: report.result,
        adjudication: report.adjudication,
        assessment: report.assessment,
        completedAt: report.completed_at,
        rawResponse: report,
        normalizedResult: normalized
      });
      await saveScreeningResult({
        applicationId: application.id,
        requestId: request.id,
        provider: "CHECKR",
        status: normalized.status,
        providerResultId: invitation.report_id,
        rawResponse: report,
        normalizedResult: normalized
      });
      return updateScreeningRequest(request.id, {
        status: normalized.status,
        providerRequestId: invitation.report_id
      });
    }
    return updated;
  } catch (error) {
    await updateScreeningRequest(request.id, {
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "Checkr screening could not be started."
    });
    throw error;
  }
}

export async function startPlaidScreening(application: ScreeningApplicationRecord, sendInvite = true) {
  let request = await getLatestRequest(application.id, "PLAID");
  if (!request || ["FAILED", "EXPIRED"].includes(request.status)) {
    request = await createScreeningRequest({
      application,
      provider: "PLAID",
      screeningKind: "income_identity",
      status: "INVITED"
    });
    await savePlaidVerification({
      applicationId: application.id,
      requestId: request.id,
      status: "INVITED"
    });
  }

  if (sendInvite) {
    const { token } = await rotateApplicantAccess(application.id);
    const store = await readStore();
    const source = store.rentalApplications.find((item) => item.id === application.sourceApplicationId);
    const propertyLabel = source
      ? getApplicationAddressLabel(store, source)
      : String(application.metadata.applicationTitle ?? "your rental application");
    const delivery = await sendScreeningInviteEmail({
      to: application.applicantEmail,
      applicantName: application.applicantFirstName,
      propertyLabel,
      screeningUrl: buildAppUrl(`/screening/access/${token}`),
      organizationId: application.organizationId,
      userId: application.applicantUserId ?? undefined
    });
    if (!delivery.sent) {
      await updateScreeningRequest(request.id, {
        status: "FAILED",
        errorMessage: delivery.error || "The screening invitation email was not delivered."
      });
      throw new Error(delivery.error || "The screening invitation email was not delivered.");
    }
  }

  return request;
}

export async function startFullScreening(application: ScreeningApplicationRecord) {
  const [checkr, plaid] = await Promise.allSettled([
    startCheckrScreening(application),
    startPlaidScreening(application, true)
  ]);
  if (checkr.status === "rejected" && plaid.status === "rejected") {
    throw new Error(`Screening could not start: ${checkr.reason instanceof Error ? checkr.reason.message : "Checkr failed"}; ${plaid.reason instanceof Error ? plaid.reason.message : "Plaid failed"}`);
  }
  return {
    checkr: checkr.status === "fulfilled" ? checkr.value : { error: String(checkr.reason) },
    plaid: plaid.status === "fulfilled" ? plaid.value : { error: String(plaid.reason) }
  };
}

export async function ensureApplicantPortalAccess(submissionId: string) {
  const application = await provisionScreeningApplication(submissionId);
  const access = await rotateApplicantAccess(application.id);
  return {
    application,
    path: `/screening/access/${access.token}`
  };
}

export function encryptPlaidToken(value?: string | null) {
  return value ? encryptProviderToken(value) : null;
}
