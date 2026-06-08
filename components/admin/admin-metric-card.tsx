import { StatCard } from "@/components/stat-card";

export function AdminMetricCard({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand" | "blue";
}) {
  return <StatCard label={label} value={value} detail={detail} tone={tone} />;
}
