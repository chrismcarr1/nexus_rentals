import "server-only";

import { cache } from "react";

// Lightweight server-side timing helper. Wraps an async call and logs how long
// it took, so a single request's load path can be reconstructed from the logs.
// Server-only: never bundled into a client component, so timings never leak.
export async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();

  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label}: ${Math.round(performance.now() - start)}ms`);
  }
}

// ---------------------------------------------------------------------------
// Request-scoped perf accumulator (instrumentation only).
//
// React cache() gives one instance per request render; if called outside a
// request scope it just yields a throwaway instance, which is harmless because
// only the dashboard page emits the consolidated summary. Every recorder below
// is a no-op unless NEXUS_PERF_LOG=1, so there is zero overhead in normal runs
// (getDashboardPerf is never even invoked when the flag is off). Counts and
// timings only — never any store contents, tenant, or identity data.
// ---------------------------------------------------------------------------

type DashboardPerf = {
  readStoreCalls: number;
  cacheHit: boolean | null; // outcome of the first readStore in the request
  cacheAgeMs: number | null;
  neonFetchMs: number | null;
  storeSizeKb: number | null;
  orgSnapshotMs: number | null;
  portalContextMs: number | null;
  dashboardAggregationMs: number | null;
};

type DashboardDurationKey = "orgSnapshotMs" | "portalContextMs" | "dashboardAggregationMs";

function perfEnabled() {
  return process.env.NEXUS_PERF_LOG === "1";
}

const getDashboardPerf = cache(
  (): DashboardPerf => ({
    readStoreCalls: 0,
    cacheHit: null,
    cacheAgeMs: null,
    neonFetchMs: null,
    storeSizeKb: null,
    orgSnapshotMs: null,
    portalContextMs: null,
    dashboardAggregationMs: null
  })
);

// Called from readStore on every entry. The first call decides the request's
// overall cache outcome (a request that took a neon fetch counts as a miss).
export function recordReadStore(outcome: { cacheHit: boolean; cacheAgeMs?: number }) {
  if (!perfEnabled()) return;
  const perf = getDashboardPerf();
  perf.readStoreCalls += 1;
  if (perf.cacheHit === null) {
    perf.cacheHit = outcome.cacheHit;
    if (outcome.cacheHit && typeof outcome.cacheAgeMs === "number") {
      perf.cacheAgeMs = outcome.cacheAgeMs;
    }
  }
}

// Called from the actual Neon fetch path so the request is flagged as a miss.
export function recordNeonFetch(neonFetchMs: number, storeSizeKb: number | null) {
  if (!perfEnabled()) return;
  const perf = getDashboardPerf();
  perf.neonFetchMs = neonFetchMs;
  if (typeof storeSizeKb === "number") perf.storeSizeKb = storeSizeKb;
}

export function recordDashboardDuration(key: DashboardDurationKey, ms: number) {
  if (!perfEnabled()) return;
  getDashboardPerf()[key] = ms;
}

// Like timeAsync, but also records the duration into the request accumulator.
// The console log is identical to timeAsync so existing detailed logs are kept.
export async function timeAsyncTracked<T>(
  label: string,
  key: DashboardDurationKey,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[perf] ${label}: ${ms}ms`);
    recordDashboardDuration(key, ms);
  }
}

// One consolidated line for easy before/after capture in production logs.
export function logDashboardPerfSummary(totalDataPrepMs: number) {
  if (!perfEnabled()) return;
  const p = getDashboardPerf();
  const cacheState = p.cacheHit === null ? "null" : p.cacheHit ? "hit" : "miss";
  console.log(
    `[perf:dashboard] summary totalDataPrepMs=${Math.round(totalDataPrepMs)} ` +
      `readStoreCalls=${p.readStoreCalls} cache=${cacheState} cacheAgeMs=${p.cacheAgeMs ?? "null"} ` +
      `neonFetchMs=${p.neonFetchMs ?? "null"} storeSizeKb=${p.storeSizeKb ?? "null"} ` +
      `orgSnapshotMs=${p.orgSnapshotMs ?? "null"} portalContextMs=${p.portalContextMs ?? "null"} ` +
      `dashboardAggregationMs=${p.dashboardAggregationMs ?? "null"}`
  );
}
