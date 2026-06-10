import { NextResponse } from "next/server";

import { requireApplicantScreeningAccess } from "@/lib/screening/applicant-access";
import { getCurrentUser } from "@/lib/auth";
import {
  requireManagerScreeningApiAccess,
  screeningApiError
} from "@/lib/screening/api-access";
import { getScreeningSummary } from "@/lib/screening/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (user?.role === "MANAGER") {
      const { application } = await requireManagerScreeningApiAccess(id);
      return NextResponse.json(await getScreeningSummary(application.id));
    }

    const application = await requireApplicantScreeningAccess(id);
    const summary = await getScreeningSummary(application.id);
    return NextResponse.json({
      application: {
        id: summary.application.id,
        status: summary.application.status,
        consentStatus: summary.application.consentStatus
      },
      requests: summary.requests.map((request) => ({
        provider: request.provider,
        status: request.status,
        updatedAt: request.updatedAt
      })),
      checkrInvitationUrl: summary.checkrInvitationUrl ?? null,
      plaid: summary.plaid
        ? {
            status: summary.plaid.status,
            identityVerified: summary.plaid.identityVerified,
            incomeVerified: Boolean(summary.plaid.verifiedMonthlyIncome)
          }
        : null
    });
  } catch (error) {
    const result = screeningApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
