import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { ReportExportMenu } from "@/components/report-export-menu";
import { Card } from "@/components/ui/card";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { getReportsSnapshot } from "@/services/finance";
import { getPortalContext } from "@/services/portal";

export default async function ReportsPage() {
  const user = await requireRoles([UserRole.ADMIN]);
  const portal = await getPortalContext(user);
  const report = await getReportsSnapshot(user.organizationId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Executive reporting"
        title="Financial reporting, compliance context, and audit visibility."
        description="A higher-level reporting view for admins with portfolio summaries, export actions, recent operational activity, and document/compliance awareness."
        actions={<ReportExportMenu />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">Collected</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.rentCollectedThisMonth)}</p></Card>
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">Outstanding</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.outstanding)}</p></Card>
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">Expenses</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.monthExpenses)}</p></Card>
        <Card className="p-5"><p className="text-sm text-[var(--muted)]">Net cash flow</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.netOperatingCashFlow)}</p></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">By property</p>
          <DataTable columns={["Property", "Units", "Occupancy", "Collected", "Expenses", "Net"]} className="mt-5">
            {report.byProperty.map((row) => (
              <tr key={row.propertyId} className="table-row">
                <td className="py-4 pr-4 font-semibold">{row.name}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{row.units}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{Math.round(row.occupancyRate * 100)}%</td>
                <td className="py-4 pr-4 font-semibold">{formatCurrency(row.collected)}</td>
                <td className="py-4 pr-4 text-[var(--muted)]">{formatCurrency(row.totalExpenses)}</td>
                <td className="py-4 pr-4 font-semibold">{formatCurrency(row.net)}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Documents and compliance</p>
            <div className="mt-4 space-y-3">
              {portal.documents.map((file) => (
                <div key={file.id} className="panel-muted rounded-[24px] p-4">
                  <p className="font-semibold">{file.label || file.kind}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{file.path}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Recent activity feed</p>
            <div className="mt-4 space-y-3">
              {portal.recentActivity.map((item) => (
                <div key={item.id} className="panel-muted rounded-[24px] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{item.title}</p>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{item.kind}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
