import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm uppercase tracking-[0.24em] text-stone-400">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-[var(--text)]">{value}</p>
      <p className="mt-2 text-sm text-stone-500">{hint}</p>
    </Card>
  );
}
