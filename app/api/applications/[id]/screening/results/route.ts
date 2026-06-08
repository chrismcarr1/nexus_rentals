import { NextResponse } from "next/server";

import {
  requireManagerScreeningApiAccess,
  screeningApiError
} from "@/lib/screening/api-access";
import { getNormalizedResults } from "@/lib/screening/repository";
import { getScreeningSummary } from "@/lib/screening/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { application } = await requireManagerScreeningApiAccess(id);
    const [summary, stored] = await Promise.all([
      getScreeningSummary(application.id),
      getNormalizedResults(application.id)
    ]);
    return NextResponse.json({
      summary,
      providerRecords: stored.raw
    });
  } catch (error) {
    const result = screeningApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
