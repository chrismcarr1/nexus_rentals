import Link from "next/link";

import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getDashboardSnapshot } from "@/services/finance";
import { globalSearch } from "@/services/search";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const snapshot = await getDashboardSnapshot(user.organizationId);
  const searchResults = await globalSearch(user.organizationId, params.q);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="overflow-hidden p-6">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.26em] text-[var(--brand)]">Executive Dashboard</p>
              <h1 className="mt-3 font-[var(--font-display)] text-5xl leading-tight">Portfolio command center for smarter rental operations.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
                Track cash flow, occupancy, collections, maintenance activity, lease risk, and AI-generated damage assessments from a single local workspace.
              </p>
            </div>
            <div className="rounded-[28px] bg-[linear-gradient(135deg,#184c45,#2d756b)] p-5 text-white">
              <p className="text-xs uppercase tracking-[0.24em] text-white/70">This Month</p>
              <p className="mt-3 text-4xl font-semibold">{formatCurrency(snapshot.metrics.netOperatingCashFlow)}</p>
              <p className="mt-2 text-sm text-white/80">Net operating cash flow after expenses</p>
            </div>
          </div>
          {params.q ? (
            <div className="mt-6 grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/70 p-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Properties</p>
                <div className="mt-3 space-y-2">
                  {searchResults.properties.length ? searchResults.properties.map((item) => <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-xl bg-stone-900/5 px-3 py-2 text-sm">{item.name}</Link>) : <p className="text-sm text-stone-500">No property matches</p>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Units</p>
                <div className="mt-3 space-y-2">
                  {searchResults.units.length ? searchResults.units.map((item) => <Link key={item.id} href={`/units/${item.id}`} className="block rounded-xl bg-stone-900/5 px-3 py-2 text-sm">{item.property.name} {item.unitNumber}</Link>) : <p className="text-sm text-stone-500">No unit matches</p>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Tenants</p>
                <div className="mt-3 space-y-2">
                  {searchResults.tenants.length ? searchResults.tenants.map((item) => <Link key={item.id} href="/tenants" className="block rounded-xl bg-stone-900/5 px-3 py-2 text-sm">{item.firstName} {item.lastName}</Link>) : <p className="text-sm text-stone-500">No tenant matches</p>}
                </div>
              </div>
            </div>
          ) : null}
        </Card>
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Alerts</p>
          <div className="mt-4 space-y-3">
            {snapshot.notifications.map((item) => (
              <div key={item.id} className="rounded-[22px] bg-stone-900/5 p-4">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-stone-500">{item.body}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Properties" value={String(snapshot.metrics.totalProperties)} hint="Managed assets in the active portfolio" />
        <MetricCard label="Units" value={String(snapshot.metrics.totalUnits)} hint={`${snapshot.metrics.occupiedUnits} occupied / ${snapshot.metrics.vacantUnits} vacant`} />
        <MetricCard label="Recurring Rent" value={formatCurrency(snapshot.metrics.monthlyRecurringRent)} hint="Current monthly scheduled rent base" />
        <MetricCard label="Rent Collected" value={formatCurrency(snapshot.metrics.rentCollectedThisMonth)} hint={`Outstanding ${formatCurrency(snapshot.metrics.outstanding)}`} />
        <MetricCard label="Overdue" value={formatCurrency(snapshot.metrics.overdue)} hint="Balances past due and requiring follow-up" />
        <MetricCard label="Expenses" value={formatCurrency(snapshot.metrics.monthExpenses)} hint="Current month operating expense volume" />
        <MetricCard label="Deposits Held" value={formatCurrency(snapshot.metrics.depositsHeld)} hint="Security deposits under active/upcoming leases" />
        <MetricCard label="Assessments" value={String(snapshot.recentAssessments.length)} hint="Recent AI damage reviews in the system" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Cash Flow Trend</p>
              <h2 className="mt-2 text-2xl font-semibold">Rent vs expenses</h2>
            </div>
            <Link href="/reports" className="text-sm font-semibold text-[var(--brand)]">Open reports</Link>
          </div>
          <CashFlowChart data={snapshot.charts.cashFlowTrend} />
        </Card>
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Upcoming Lease Expirations</p>
          <div className="mt-5 space-y-3">
            {snapshot.upcomingLeaseExpirations.map((lease) => (
              <div key={lease.id} className="rounded-[22px] bg-stone-900/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{lease.unit.property.name} {lease.unit.unitNumber}</p>
                    <p className="text-sm text-stone-500">{lease.tenants.map((item) => `${item.tenant.firstName} ${item.tenant.lastName}`).join(", ") || "Unassigned tenant"}</p>
                  </div>
                  <Badge tone="warning">{formatDate(lease.endDate)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-1">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Recent Payments</p>
          <div className="mt-4 space-y-3">
            {snapshot.recentPayments.map((payment) => (
              <div key={payment.id} className="rounded-[22px] bg-stone-900/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{payment.description}</p>
                    <p className="text-sm text-stone-500">{payment.unit.property.name} {payment.unit.unitNumber}</p>
                  </div>
                  <Badge tone={payment.status === "PAID" ? "success" : payment.status === "LATE" ? "danger" : "warning"}>{payment.status}</Badge>
                </div>
                <p className="mt-3 text-lg font-semibold">{formatCurrency(payment.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 xl:col-span-1">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Recent Expenses</p>
          <div className="mt-4 space-y-3">
            {snapshot.recentExpenses.map((expense) => (
              <div key={expense.id} className="rounded-[22px] bg-stone-900/5 p-4">
                <p className="font-semibold">{expense.title}</p>
                <p className="text-sm text-stone-500">{expense.property.name}</p>
                <p className="mt-3 text-lg font-semibold">{formatCurrency(expense.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 xl:col-span-1">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Recent AI Damage Reviews</p>
          <div className="mt-4 space-y-3">
            {snapshot.recentAssessments.map((assessment) => (
              <div key={assessment.id} className="rounded-[22px] bg-stone-900/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{assessment.inspection.unit.property.name} {assessment.inspection.unit.unitNumber}</p>
                  <Badge tone={assessment.severity === "LOW" ? "success" : assessment.severity === "CRITICAL" ? "danger" : "warning"}>{assessment.severity}</Badge>
                </div>
                <p className="mt-2 text-sm text-stone-500">{assessment.summary}</p>
                <p className="mt-3 text-lg font-semibold">{formatCurrency(assessment.estimatedLow)} - {formatCurrency(assessment.estimatedHigh)}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
