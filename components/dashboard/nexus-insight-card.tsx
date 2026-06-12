import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";

import type { DashboardInsight } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<DashboardInsight["tone"], { border: string; icon: string }> = {
  danger: { border: "border-t-2 border-t-[var(--danger)]", icon: "bg-red-600/10 text-red-600" },
  warning: { border: "border-t-2 border-t-amber-500", icon: "bg-amber-500/12 text-amber-700" },
  success: { border: "border-t-2 border-t-[var(--brand)]", icon: "bg-[var(--accent-soft)] text-[var(--brand)]" }
};

// Deterministic, rule-based recommendation computed in lib/dashboard-metrics.
export function NexusInsightCard({ insight }: { insight: DashboardInsight }) {
  const tone = TONE_CLASSES[insight.tone];
  return (
    <div className={cn("detail-panel surface-card min-w-0 p-4", tone.border)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", tone.icon)}>
          <Lightbulb className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Nexus insight</p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--text)]">{insight.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted-strong)]">{insight.body}</p>
          <Link
            href={insight.href}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]"
          >
            {insight.linkLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
