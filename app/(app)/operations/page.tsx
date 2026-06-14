import Link from "next/link";
import { Search } from "lucide-react";

import { OperationsTimelineList } from "@/components/operations-timeline-list";
import { PageHeader } from "@/components/page-header";
import { requireRoles } from "@/lib/auth";
import {
  filterOperationsEvents,
  normalizeOperationsFilter,
  OPERATIONS_FILTERS
} from "@/lib/operations-timeline";
import { UserRole } from "@/lib/store";
import { cn } from "@/lib/utils";
import { getOperationsTimeline } from "@/services/operations";

export default async function OperationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const params = (await searchParams) ?? {};
  const filter = normalizeOperationsFilter(params.filter);
  const query = params.q?.trim() ?? "";
  const events = await getOperationsTimeline(user);
  const filtered = filterOperationsEvents(events, filter, query);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Portfolio command center"
        title="Operations Timeline"
        description="Upcoming rent, leases, maintenance, move-ins, and portfolio deadlines."
      />

      <div className="operations-toolbar">
        <div className="operations-filters" aria-label="Timeline filters">
          {OPERATIONS_FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/operations?filter=${item.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              aria-current={filter === item.key ? "page" : undefined}
              className={cn("operations-filter", filter === item.key && "operations-filter-active")}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <form action="/operations" className="operations-search">
          <input type="hidden" name="filter" value={filter} />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            name="q"
            defaultValue={query}
            className="field w-full pl-9"
            placeholder="Search tenant, property, unit, or event"
          />
        </form>
      </div>

      <OperationsTimelineList
        events={filtered}
        emptyMessage={
          events.length
            ? `No ${filter === "all" ? "timeline" : filter.replace("-", " ")} events found for this period.`
            : "Events will appear here once you add properties, leases, payments, and maintenance."
        }
      />
    </div>
  );
}
