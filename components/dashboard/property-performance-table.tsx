import Link from "next/link";
import { Building2 } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import type { PropertyPerformanceRow } from "@/lib/dashboard-metrics";
import { cn, formatCurrency } from "@/lib/utils";

export function PropertyPerformanceTable({ rows, rangeLabel }: { rows: PropertyPerformanceRow[]; rangeLabel: string }) {
  return (
    <DetailSection
      title="Property performance"
      description={`Per-property collections and operations for ${rangeLabel.toLowerCase()}. Properties needing attention sort first.`}
      actions={
        <Link href="/properties" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
          View properties
        </Link>
      }
    >
      {rows.length ? (
        <DataTable columns={["Property", "Occupancy", "Collected", "Outstanding", "Overdue", "Open work", "Renewals"]} minWidth="52rem">
          {rows.map((row) => (
            <tr key={row.propertyId} className="table-row">
              <td className="table-cell font-semibold">
                <Link href={`/properties/${row.propertyId}`} className="inline-flex items-center gap-2 hover:text-[var(--brand)]">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", row.needsAttention ? "bg-amber-500" : "bg-emerald-500")}
                    title={row.needsAttention ? "Needs attention" : "Healthy"}
                  />
                  {row.name}
                </Link>
              </td>
              <td className="table-cell tabular-nums text-[var(--muted)]">
                {row.unitCount ? `${Math.round(row.occupancyRate * 100)}%` : "—"}
                <span className="ml-1 text-xs">({row.occupiedUnits}/{row.unitCount})</span>
              </td>
              <td className="table-cell tabular-nums font-semibold text-[var(--text)]">{formatCurrency(row.collected)}</td>
              <td className={cn("table-cell tabular-nums", row.outstanding ? "font-semibold text-amber-700" : "text-[var(--muted)]")}>
                {formatCurrency(row.outstanding)}
              </td>
              <td className={cn("table-cell tabular-nums", row.overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]")}>
                {formatCurrency(row.overdue)}
              </td>
              <td className="table-cell tabular-nums text-[var(--muted)]">{row.openMaintenance}</td>
              <td className="table-cell tabular-nums text-[var(--muted)]">{row.expiringLeases}</td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to start tracking per-property performance."
        />
      )}
    </DetailSection>
  );
}
