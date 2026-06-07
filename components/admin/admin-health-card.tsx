import { CheckCircle2, CircleAlert } from "lucide-react";

import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { cn } from "@/lib/utils";

export function AdminHealthCard({
  label,
  healthy,
  detail,
  value
}: {
  label: string;
  healthy: boolean;
  detail: string;
  value?: string;
}) {
  const Icon = healthy ? CheckCircle2 : CircleAlert;
  return (
    <div className={cn("border border-[var(--line)] bg-white p-4", !healthy && "border-red-200")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
          {value ? <p className="mt-2 break-all font-mono text-xs text-[var(--muted-strong)]">{value}</p> : null}
        </div>
        <Icon className={cn("h-5 w-5 shrink-0", healthy ? "text-[var(--success)]" : "text-[var(--danger)]")} />
      </div>
      <div className="mt-3">
        <AdminStatusBadge status={healthy ? "Healthy" : "Needs attention"} />
      </div>
    </div>
  );
}
