import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  detail,
  tone = "default",
  className
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  className?: string;
}) {
  return (
    <div className={cn("stat-card", `stat-card-${tone}`, className)}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-[var(--text)]">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}
