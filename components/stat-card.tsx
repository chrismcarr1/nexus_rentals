import { StatTile } from "@/components/stat-tile";

export function StatCard({
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
  return <StatTile label={label} value={value} detail={detail} tone={tone} className={className} />;
}
