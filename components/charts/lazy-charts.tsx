"use client";

import dynamic from "next/dynamic";

// recharts is ~110 kB of first-load JS. Loading the chart components lazily
// keeps it out of the initial bundle for the dashboard and admin pages; the
// placeholders match each chart's height so nothing shifts when they hydrate.

function chartPlaceholder(heightClass: string) {
  return function ChartPlaceholder() {
    return <div className={`${heightClass} w-full animate-pulse rounded-md bg-[var(--surface)]`} />;
  };
}

export const CashFlowChart = dynamic(
  () => import("@/components/charts/cash-flow-chart").then((mod) => mod.CashFlowChart),
  { ssr: false, loading: chartPlaceholder("h-72") }
);

export const ProjectedRevenueChart = dynamic(
  () => import("@/components/charts/projected-revenue-chart").then((mod) => mod.ProjectedRevenueChart),
  { ssr: false, loading: chartPlaceholder("h-64") }
);

export const AdminAnalyticsChart = dynamic(
  () => import("@/components/admin/admin-analytics-chart").then((mod) => mod.AdminAnalyticsChart),
  { ssr: false, loading: chartPlaceholder("h-80") }
);
