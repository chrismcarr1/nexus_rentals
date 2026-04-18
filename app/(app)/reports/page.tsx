import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { getReportsSnapshot } from "@/services/finance";

export default async function ReportsPage() {
  const user = await requireUser();
  const report = await getReportsSnapshot(user.organizationId);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Reports</p>
            <h1 className="mt-2 font-[var(--font-display)] text-4xl">Portfolio and property-level financial reporting</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/api/export/transactions" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold">Export transactions CSV</Link>
            <Link href="/api/export/expenses" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold">Export expenses CSV</Link>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5"><p className="text-sm text-stone-400">Collected</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.rentCollectedThisMonth)}</p></Card>
        <Card className="p-5"><p className="text-sm text-stone-400">Outstanding</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.outstanding)}</p></Card>
        <Card className="p-5"><p className="text-sm text-stone-400">Expenses</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.monthExpenses)}</p></Card>
        <Card className="p-5"><p className="text-sm text-stone-400">Net Cash Flow</p><p className="mt-3 text-3xl font-semibold">{formatCurrency(report.metrics.netOperatingCashFlow)}</p></Card>
      </div>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-400">By Property</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-stone-400">
              <tr>
                <th className="pb-3">Property</th>
                <th className="pb-3">Units</th>
                <th className="pb-3">Occupancy</th>
                <th className="pb-3">Collected</th>
                <th className="pb-3">Expenses</th>
                <th className="pb-3">Net</th>
              </tr>
            </thead>
            <tbody>
              {report.byProperty.map((row) => (
                <tr key={row.propertyId} className="border-t border-[var(--line)]">
                  <td className="py-4 font-semibold">{row.name}</td>
                  <td className="py-4 text-stone-500">{row.units}</td>
                  <td className="py-4 text-stone-500">{Math.round(row.occupancyRate * 100)}%</td>
                  <td className="py-4 font-semibold">{formatCurrency(row.collected)}</td>
                  <td className="py-4 text-stone-500">{formatCurrency(row.totalExpenses)}</td>
                  <td className="py-4 font-semibold">{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
