import Link from "next/link";
import { Wrench } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import type { MaintenanceQueueRow } from "@/lib/dashboard-metrics";
import { formatDate } from "@/lib/utils";

export function MaintenanceQueueCard({ queue, openCount }: { queue: MaintenanceQueueRow[]; openCount: number }) {
  return (
    <DetailSection
      title="Maintenance queue"
      description="Most urgent open work orders first."
      actions={
        <Link href="/maintenance?status=active" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
          View all{openCount ? ` (${openCount})` : ""}
        </Link>
      }
    >
      {queue.length ? (
        <div>
          {queue.map((item) => (
            <Link
              key={item.id}
              href={`/maintenance?workOrder=${item.id}`}
              className="group flex items-center gap-3 border-b border-[var(--line)] px-1 py-2.5 last:border-b-0 hover:bg-[var(--surface-hover)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text)] transition group-hover:text-[var(--brand)]">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                  {item.propertyName}
                  {item.unitNumber ? ` / Unit ${item.unitNumber}` : ""} - {formatDate(item.requestedAt)}
                  {item.assignedTo ? ` - ${item.assignedTo}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <StatusBadge status={item.priority} />
                <StatusBadge status={item.status} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Wrench}
          title="No open maintenance requests"
          description="New tenant requests and work orders will appear here."
        />
      )}
    </DetailSection>
  );
}
