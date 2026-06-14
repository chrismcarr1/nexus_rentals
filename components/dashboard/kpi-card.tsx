import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Sparkline } from "@/components/dashboard/sparkline";
import { cn } from "@/lib/utils";

const TONE_ICON_CLASSES: Record<string, string> = {
  brand: "bg-[var(--accent-soft)] text-[var(--brand)]",
  success: "bg-emerald-600/10 text-emerald-700",
  warning: "bg-amber-500/12 text-amber-700",
  danger: "bg-red-600/10 text-red-600",
  info: "bg-[var(--accent-blue)] text-[var(--info)]"
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "brand",
  trend,
  trendIsGoodWhenUp = true,
  sparkline
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  href: string;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  /** Fractional change vs the prior comparable period; null hides the chip. */
  trend?: number | null;
  trendIsGoodWhenUp?: boolean;
  sparkline?: number[];
}) {
  const showTrend = typeof trend === "number" && Number.isFinite(trend);
  const trendUp = showTrend && (trend as number) >= 0;
  const trendGood = showTrend && (trendUp ? trendIsGoodWhenUp : !trendIsGoodWhenUp);

  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col rounded-[var(--radius-panel,10px)] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_1px_2px_rgba(18,32,28,0.04)] transition hover:border-[var(--line-strong)] hover:shadow-[0_8px_24px_rgba(20,33,30,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", TONE_ICON_CLASSES[tone])}>
            <Icon className="h-4 w-4" />
          </span>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
        </div>
        {showTrend ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
              trendGood ? "bg-emerald-600/10 text-emerald-700" : "bg-red-600/10 text-red-600"
            )}
            title="Versus the prior comparable period"
          >
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(Math.round((trend as number) * 100))}%
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[1.55rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--text)]">
            {value}
          </p>
          {detail ? <p className="mt-2 truncate text-xs leading-4 text-[var(--muted)]">{detail}</p> : null}
        </div>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline values={sparkline} width={88} height={28} className="shrink-0 opacity-80 transition group-hover:opacity-100" />
        ) : null}
      </div>
    </Link>
  );
}
