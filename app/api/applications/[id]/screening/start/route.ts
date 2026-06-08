import { NextResponse } from "next/server";

import {
  requireManagerScreeningApiAccess,
  screeningApiError
} from "@/lib/screening/api-access";
import { getScreeningSummary, startFullScreening } from "@/lib/screening/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { application } = await requireManagerScreeningApiAccess(id);
    await startFullScreening(application);
    return NextResponse.json(await getScreeningSummary(application.id));
  } catch (error) {
    const result = screeningApiError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
