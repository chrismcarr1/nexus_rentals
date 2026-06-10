import { Activity, AlertCircle, CircleDollarSign, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentIcons: Record<"default" | "brand" | "success" | "warning" | "danger", LucideIcon> = {
  default: Activity,
  brand: Sparkles,
  success: CircleDollarSign,
  warning: TriangleAlert,
  danger: AlertCircle
};

export function MetricCard({
  label,
  value,
  hint,
  accent = "default"
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "default" | "brand" | "success" | "warning" | "danger";
}) {
  const Icon = accentIcons[accent];

  return (
    <Card className="metric-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{label}</p>
          <p className="mt-4 break-words text-3xl font-semibold tracking-normal text-[var(--text)]">{value}</p>
        </div>
        <span className={cn("metric-icon", `metric-accent-${accent}`)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{hint}</p>
    </Card>
  );
}
