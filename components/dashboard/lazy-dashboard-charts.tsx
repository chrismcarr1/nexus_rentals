"use client";

import dynamic from "next/dynamic";

// Same lazy-loading pattern as components/charts/lazy-charts.tsx: recharts
// stays out of the first-load bundle and placeholders match chart heights.

function chartPlaceholder(heightClass: string) {
  return function ChartPlaceholder() {
    return <div className={`${heightClass} w-full animate-pulse rounded-md bg-[var(--surface)]`} />;
  };
}

export const DashboardCashFlowChart = dynamic(
  () => import("@/components/dashboard/dashboard-cash-flow-chart").then((mod) => mod.DashboardCashFlowChart),
  { ssr: false, loading: chartPlaceholder("h-72") }
);

export const RentStatusChart = dynamic(
  () => import("@/components/dashboard/rent-status-chart").then((mod) => mod.RentStatusChart),
  { ssr: false, loading: chartPlaceholder("h-52") }
);
