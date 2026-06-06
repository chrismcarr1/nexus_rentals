import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  detail,
  tone = "default",
  className
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand" | "blue";
  className?: string;
}) {
  return (
    <div className={cn("stat-tile", `stat-tile-${tone}`, className)}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}
