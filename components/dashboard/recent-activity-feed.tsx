import Link from "next/link";
import { BellRing, ReceiptText, Wrench } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";
import type { DashboardActivityItem } from "@/services/dashboard";

const KIND_META = {
  payment: { icon: ReceiptText, className: "bg-[var(--accent-soft)] text-[var(--brand)]" },
  maintenance: { icon: Wrench, className: "bg-amber-500/12 text-amber-700" },
  notification: { icon: BellRing, className: "bg-[var(--accent-blue)] text-[var(--info)]" }
} as const;

export function RecentActivityFeed({ items }: { items: DashboardActivityItem[] }) {
  return (
    <DetailSection title="Recent activity" description="Latest payments, maintenance, and notices.">
      {items.length ? (
        <div>
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            const row = (
              <>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.className}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text)]">{item.title}</span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--muted)]">{item.detail}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{formatDate(item.date)}</span>
              </>
            );
            return item.href ? (
              <Link key={item.id} href={item.href} className="flex items-center gap-3 border-b border-[var(--line)] px-1 py-2.5 last:border-b-0 hover:bg-[var(--surface-hover)]">
                {row}
              </Link>
            ) : (
              <div key={item.id} className="flex items-center gap-3 border-b border-[var(--line)] px-1 py-2.5 last:border-b-0">
                {row}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={BellRing}
          title="No activity yet"
          description="Activity will appear here as payments, maintenance, leases, and messages are updated."
        />
      )}
    </DetailSection>
  );
}
