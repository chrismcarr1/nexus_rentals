import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ReportExportMenu } from "@/components/report-export-menu";
import { StatCard } from "@/components/stat-card";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { getReportsSnapshot } from "@/services/finance";
import { getPortalContext } from "@/services/portal";

export default async function ReportsPage() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const adminReport = user.role === "ADMIN" ? await getReportsSnapshot(user.organizationId) : null;

  const byProperty = user.role === "ADMIN"
    ? adminReport!.byProperty
    : portal.scope.properties.map((property) => {
        const units = portal.scope.units.filter((unit) => unit.propertyId === property.id);
        const payments = portal.scope.payments.filter((payment) => units.some((unit) => unit.id === payment.unitId));
        const expenses = portal.scope.expenses.filter((expense) => expense.propertyId === property.id);
        const collected = payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + payment.amount, 0);
        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

        return {
          propertyId: property.id,
          name: property.name,
          units: units.length,
          recurringRent: units.reduce((sum, unit) => sum + unit.monthlyRent, 0),
          collected,
          totalExpenses,
          net: collected - totalExpenses,
          occupancyRate: units.length ? units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length / units.length : 0
        };
      });

  const metrics = user.role === "ADMIN"
    ? {
        collected: adminReport!.metrics.rentCollectedThisMonth,
        outstanding: adminReport!.metrics.outstanding,
        expenses: adminReport!.metrics.monthExpenses,
        net: adminReport!.metrics.netOperatingCashFlow
      }
    : {
        collected: portal.metrics.collected,
        outstanding: portal.metrics.outstanding,
        expenses: portal.metrics.monthExpenses,
        net: portal.metrics.collected - portal.metrics.monthExpenses
      };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Executive reporting" : "Manager reporting"}
        title="Reports"
        description={user.role === "ADMIN" ? "Portfolio summaries, exports, recent operational activity, and compliance visibility." : "Scoped portfolio summaries for assigned properties, rent roll, collections, expenses, and operating activity."}
        actions={user.role === "ADMIN" ? <ReportExportMenu /> : null}
      />

      <section className="ops-grid">
        <StatCard label="Collected" value={formatCurrency(metrics.collected)} detail="Current month" tone="success" />
        <StatCard label="Outstanding" value={formatCurrency(metrics.outstanding)} detail="Open balances" tone={metrics.outstanding ? "warning" : "success"} />
        <StatCard label="Expenses" value={formatCurrency(metrics.expenses)} detail="Current month spend" />
        <StatCard label="Net cash flow" value={formatCurrency(metrics.net)} detail="Collected less expenses" tone={metrics.net >= 0 ? "brand" : "danger"} />
      </section>

      <section className="ops-split">
        <DetailSection title="Property performance" description="Portfolio-level rollups by property.">
          {byProperty.length ? (
            <DataTable columns={["Property", "Units", "Occupancy", "Rent roll", "Collected", "Expenses", "Net"]} minWidth="56rem">
              {byProperty.map((row) => (
                <tr key={row.propertyId} className="table-row">
                  <td className="table-cell font-semibold">{row.name}</td>
                  <td className="table-cell text-[var(--muted)]">{row.units}</td>
                  <td className="table-cell text-[var(--muted)]">{Math.round(row.occupancyRate * 100)}%</td>
                  <td className="table-cell font-semibold">{formatCurrency(row.recurringRent)}</td>
                  <td className="table-cell font-semibold">{formatCurrency(row.collected)}</td>
                  <td className="table-cell text-[var(--muted)]">{formatCurrency(row.totalExpenses)}</td>
                  <td className="table-cell font-semibold">{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <EmptyState title="No report data" description="Create properties and units to populate property performance reporting." />
          )}
        </DetailSection>

        <DetailSection title="Recent activity feed" description="Latest operational activity in scope.">
          {portal.recentActivity.length ? (
            <div>
              {portal.recentActivity.map((item) => (
                <div key={item.id} className="activity-item">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{item.kind}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent activity" description="Payments, maintenance, and notices will appear here." />
          )}
        </DetailSection>
      </section>
    </div>
  );
}
