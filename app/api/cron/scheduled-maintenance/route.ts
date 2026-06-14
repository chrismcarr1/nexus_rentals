import { NextResponse } from "next/server";

import { isSystemAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { getScheduledMaintenanceStatus, runScheduledMaintenance } from "@/lib/scheduled-maintenance";

export const dynamic = "force-dynamic";

// Authorized either by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set) or by a logged-in system admin hitting the
// route manually. In production CRON_SECRET must be set or the cron cannot run.
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }
  // Manual admin trigger fallback (uses the session cookie; absent for cron).
  const user = await getCurrentUser();
  return Boolean(user && isSystemAdminEmail(user.email));
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScheduledMaintenance();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    // Detail is logged server-side in runScheduledMaintenance; never leak it.
    return NextResponse.json(
      { ok: false, error: "Scheduled maintenance failed", status: getScheduledMaintenanceStatus() },
      { status: 500 }
    );
  }
}
