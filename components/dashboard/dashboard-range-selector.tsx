import Link from "next/link";

import { DASHBOARD_RANGE_OPTIONS, type DashboardRangeKey } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";

// Server-rendered date range filter: plain links with a `range` query param so
// the whole dashboard recomputes server-side. No client state to drift.
export function DashboardRangeSelector({ activeKey }: { activeKey: DashboardRangeKey }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--panel)] p-1">
      {DASHBOARD_RANGE_OPTIONS.map((option) => {
        const active = option.key === activeKey;
        return (
          <Link
            key={option.key}
            href={option.key === "this-month" ? "/dashboard" : `/dashboard?range=${option.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded px-2.5 py-1.5 text-xs font-semibold transition",
              active
                ? "bg-[var(--accent-soft)] text-[var(--brand-strong)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
