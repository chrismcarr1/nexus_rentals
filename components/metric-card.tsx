import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
  accent = "default"
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "default" | "brand" | "success" | "warning";
}) {
  return (
    <Card className="p-5 lg:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{label}</p>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">{value}</p>
        </div>
        <span
          className={
            accent === "brand"
              ? "h-3 w-3 rounded-full bg-[var(--brand)]"
              : accent === "success"
                ? "h-3 w-3 rounded-full bg-[var(--success)]"
                : accent === "warning"
                  ? "h-3 w-3 rounded-full bg-[var(--warning)]"
                  : "h-3 w-3 rounded-full bg-slate-300"
          }
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{hint}</p>
    </Card>
  );
}
