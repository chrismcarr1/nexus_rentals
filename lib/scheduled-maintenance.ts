import "server-only";

import { ensureLeaseConnectionIntegrity } from "@/lib/lease-connections";
import { ensureScheduledLeasePayments } from "@/lib/lease-payment-scheduler";

// Idempotent catch-up jobs (lease-connection integrity + scheduled rent
// generation) that used to run synchronously inside the dashboard render path.
// They are now driven out-of-band by a Vercel Cron job (or an admin manual
// trigger) so page rendering never blocks on their updateStore transactions.
// Mutating actions (move-ins, lease edits, invite accept) still invoke the
// schedulers directly, so this is purely periodic catch-up.

export type ScheduledMaintenanceResult = {
  ok: boolean;
  durationMs: number;
  ranAt: string;
};

// In-memory observability only — intentionally no store/schema change. Resets on
// cold start, which is fine: it is a best-effort status surface, not a source of
// truth. The cron route also returns the result in its response.
let lastScheduledMaintenanceRunAt: string | null = null;
let lastScheduledMaintenanceResult: "success" | "error" | null = null;

export function getScheduledMaintenanceStatus() {
  return { lastScheduledMaintenanceRunAt, lastScheduledMaintenanceResult };
}

// Runs the catch-up jobs. With no organizationId the underlying helpers process
// every organization (the cron case); pass an id to scope to one org.
export async function runScheduledMaintenance(organizationId?: string): Promise<ScheduledMaintenanceResult> {
  const startedAt = Date.now();
  try {
    await ensureLeaseConnectionIntegrity(organizationId);
    await ensureScheduledLeasePayments(organizationId);
    lastScheduledMaintenanceRunAt = new Date().toISOString();
    lastScheduledMaintenanceResult = "success";
    const durationMs = Date.now() - startedAt;
    console.log(`[scheduled-maintenance] completed in ${durationMs}ms`, { organizationId: organizationId ?? "ALL" });
    return { ok: true, durationMs, ranAt: lastScheduledMaintenanceRunAt };
  } catch (error) {
    lastScheduledMaintenanceRunAt = new Date().toISOString();
    lastScheduledMaintenanceResult = "error";
    console.error("[scheduled-maintenance] run failed", error);
    throw error;
  }
}
