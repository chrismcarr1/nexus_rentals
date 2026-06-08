import { NextResponse } from "next/server";

import { requireApplicantScreeningAccess } from "@/lib/screening/applicant-access";
import { screeningApiError } from "@/lib/screening/api-access";
import { createApplicantPlaidLink } from "@/lib/screening/plaid-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const application = await requireApplicantScreeningAccess(id);
    const body = (await request.json().catch(() => ({}))) as { consentAccepted?: boolean };
    return NextResponse.json(await createApplicantPlaidLink(application, body.consentAccepted === true));
  } catch (error) {
    const result = screeningApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
