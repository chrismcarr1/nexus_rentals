import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import type { UrgentTask } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<UrgentTask["tone"], string> = {
  danger: "bg-[var(--danger)]",
  warning: "bg-amber-500",
  default: "bg-[var(--line-strong)]"
};

const TONE_COUNT: Record<UrgentTask["tone"], string> = {
  danger: "bg-red-600/10 text-red-700",
  warning: "bg-amber-500/12 text-amber-800",
  default: "bg-[var(--surface-hover)] text-[var(--muted-strong)]"
};

export function UrgentTasksPanel({ tasks }: { tasks: UrgentTask[] }) {
  return (
    <DetailSection
      title="What needs my attention?"
      description="Highest-impact follow-ups across the portfolio."
    >
      {tasks.length ? (
        <div>
          {tasks.map((task) => (
            <Link
              key={task.key}
              href={task.href}
              className="group flex items-center gap-3 border-b border-[var(--line)] px-1 py-3 last:border-b-0 hover:bg-[var(--surface-hover)]"
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[task.tone])} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text)] transition group-hover:text-[var(--brand)]">
                  {task.label}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{task.detail}</span>
              </span>
              <span className={cn("inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums", TONE_COUNT[task.tone])}>
                {task.count}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--brand)]" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing needs attention"
          description="Collections, maintenance, and renewals are all clear right now."
        />
      )}
    </DetailSection>
  );
}
