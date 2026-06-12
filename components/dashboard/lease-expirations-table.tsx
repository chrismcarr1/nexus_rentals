import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import type { LeaseExpirationRow } from "@/lib/dashboard-metrics";
import { formatCurrency, formatDate } from "@/lib/utils";

export function LeaseExpirationsTable({ rows }: { rows: LeaseExpirationRow[] }) {
  return (
    <DetailSection
      title="Upcoming lease expirations"
      description="Active leases ending in the next 60 days."
      actions={
        <Link href="/leases" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
          View all leases
        </Link>
      }
    >
      {rows.length ? (
        <DataTable columns={["Tenant", "Property / unit", "Ends", "Days left", "Rent"]} minWidth="38rem">
          {rows.slice(0, 6).map((row) => (
            <tr key={row.leaseId} className="table-row">
              <td className="table-cell font-semibold">
                <Link href={`/leases/${row.leaseId}`} className="hover:text-[var(--brand)]">
                  {row.tenantName}
                </Link>
              </td>
              <td className="table-cell text-[var(--muted)]">
                {row.propertyName}
                {row.unitNumber ? ` / Unit ${row.unitNumber}` : ""}
              </td>
              <td className="table-cell text-[var(--muted)]">{formatDate(row.endDate)}</td>
              <td className="table-cell">
                <StatusBadge status={`${row.daysRemaining} days`} tone={row.daysRemaining <= 30 ? "warning" : "default"} />
              </td>
              <td className="table-cell tabular-nums text-[var(--muted)]">{formatCurrency(row.monthlyRent)}</td>
            </tr>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="No leases expiring in the next 60 days"
          description="Renewal decisions will appear here as lease end dates approach."
        />
      )}
    </DetailSection>
  );
}
