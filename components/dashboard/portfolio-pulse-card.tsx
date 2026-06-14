import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import type { PulseRow, PulseStatus } from "@/lib/dashboard-metrics";

const STATUS_META: Record<PulseStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  healthy: { icon: CheckCircle2, className: "text-emerald-600", label: "Healthy" },
  watch: { icon: AlertTriangle, className: "text-amber-600", label: "Watch" },
  attention: { icon: AlertCircle, className: "text-[var(--danger)]", label: "Attention" }
};

export function PortfolioPulseCard({ pulse }: { pulse: PulseRow[] }) {
  return (
    <DetailSection title="Portfolio pulse" description="Operating health at a glance.">
      <div>
        {pulse.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.icon;
          return (
            <Link
              key={row.key}
              href={row.href}
              className="group flex items-center gap-3 border-b border-[var(--line)] px-1 py-2.5 last:border-b-0 hover:bg-[var(--surface-hover)]"
            >
              <Icon className={`h-4 w-4 shrink-0 ${meta.className}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--text)] transition group-hover:text-[var(--brand)]">{row.label}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{row.detail}</span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{meta.label}</span>
            </Link>
          );
        })}
      </div>
    </DetailSection>
  );
}
