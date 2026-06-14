import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Wrench
} from "lucide-react";

import { CashFlowChart } from "@/components/charts/lazy-charts";
import { DashboardRangeSelector } from "@/components/dashboard/dashboard-range-selector";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardCashFlowChart, RentStatusChart } from "@/components/dashboard/lazy-dashboard-charts";
import { LeaseExpirationsTable } from "@/components/dashboard/lease-expirations-table";
import { MaintenanceQueueCard } from "@/components/dashboard/maintenance-queue-card";
import { NexusInsightCard } from "@/components/dashboard/nexus-insight-card";
import { PortfolioPulseCard } from "@/components/dashboard/portfolio-pulse-card";
import { PropertyPerformanceTable } from "@/components/dashboard/property-performance-table";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";
import { TenantMessagesCard } from "@/components/dashboard/tenant-messages-card";
import { UrgentTasksPanel } from "@/components/dashboard/urgent-tasks-panel";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { UpcomingOperationsCard } from "@/components/operations-timeline-list";
import { QuickActionMenu } from "@/components/quick-action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createStripeCheckoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { hasAcceptedCurrentPaymentTerms } from "@/lib/legal";
import { logDashboardPerfSummary, timeAsync, timeAsyncTracked } from "@/lib/perf";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getManagerDashboardData } from "@/services/dashboard";
import { getDashboardSnapshot } from "@/services/finance";
import { getOperationsTimeline } from "@/services/operations";
import { badgeToneFromPayment, badgeToneFromPriority, badgeToneFromMaintenance, getNotificationLabel, getPortalContext } from "@/services/portal";
import { globalSearch } from "@/services/search";

function formatPercent(rate: number) {
  const value = rate * 100;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  // Whole server-side data-prep envelope for one dashboard request. getCurrentUser
  // and getPortalContext are instrumented at their source (React cache()), so
  // they emit their own real one-time timings even though they are cache hits here.
  const dataPrepStart = performance.now();
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const portal = await getPortalContext(user);
  const operations = await timeAsync("[perf:dashboard] getOperationsTimeline", () => getOperationsTimeline(user));
  const searchResults =
    params.q && user.role !== "TENANT"
      ? await timeAsync("[perf:dashboard] globalSearch", () =>
          globalSearch(user.organizationId, params.q!, {
            propertyIds: portal.scope.properties.map((item) => item.id),
            unitIds: portal.scope.units.map((item) => item.id),
            tenantIds: portal.scope.tenants.map((item) => item.id)
          })
        )
      : null;

  const searchSection =
    params.q && searchResults ? (
      <DetailSection title={`Search results for "${params.q}"`} description="Jump directly into matching records.">
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Properties</p>
            <div className="mt-2 space-y-1">
              {searchResults.properties.length ? searchResults.properties.map((item) => (
                <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[var(--surface-hover)]">{item.name}</Link>
              )) : <p className="text-sm text-[var(--muted)]">No property matches.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Units</p>
            <div className="mt-2 space-y-1">
              {searchResults.units.length ? searchResults.units.map((item) => (
                <Link key={item.id} href={`/units/${item.id}`} className="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[var(--surface-hover)]">{item.property.name} {item.unitNumber}</Link>
              )) : <p className="text-sm text-[var(--muted)]">No unit matches.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Tenants</p>
            <div className="mt-2 space-y-1">
              {searchResults.tenants.length ? searchResults.tenants.map((item) => (
                <Link key={item.id} href="/tenants" className="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[var(--surface-hover)]">{item.firstName} {item.lastName}</Link>
              )) : <p className="text-sm text-[var(--muted)]">No tenant matches.</p>}
            </div>
          </div>
        </div>
      </DetailSection>
    ) : null;

  if (user.role === "MANAGER") {
    const dashboard = await timeAsyncTracked("[perf:dashboard] dashboardAggregation", "dashboardAggregationMs", () =>
      getManagerDashboardData(user, params.range)
    );
    const totalDataPrepMs = performance.now() - dataPrepStart;
    console.log(`[perf:dashboard] totalDataPrep: ${Math.round(totalDataPrepMs)}ms`);
    logDashboardPerfSummary(totalDataPrepMs);
    const { range, kpis } = dashboard;
    const paidHref = `/transactions?tab=payments&dateFrom=${range.start}&dateTo=${range.end}`;
    const rentStatusHrefs: Record<string, string> = {
      paid: paidHref,
      partial: "/transactions?status=Partial",
      outstanding: "/transactions",
      overdue: "/transactions?status=overdue"
    };
    const rentStatusDotColors: Record<string, string> = {
      paid: "bg-[var(--brand)]",
      partial: "bg-amber-600",
      outstanding: "bg-amber-500",
      overdue: "bg-[var(--danger)]"
    };

    return (
      <div className="dashboard-page">
        <header className="page-header">
          <div className="page-header-copy min-w-0 max-w-4xl">
            <h1 className="page-title font-semibold text-[var(--text)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Overview of portfolio performance and operations.</p>
          </div>
          <div className="page-actions flex flex-wrap items-center gap-2">
            <DashboardRangeSelector activeKey={range.key} />
            <QuickActionMenu role={user.role} />
          </div>
        </header>

        {searchSection}

        {!dashboard.stripe.ready && !dashboard.emptyState ? (
          <div className="page-alert page-alert-warning flex flex-wrap items-center justify-between gap-3">
            <span>Connect Stripe to collect rent online. {dashboard.stripe.detail}</span>
            <Link href="/settings" className="inline-flex shrink-0 items-center gap-1.5 font-semibold underline underline-offset-2">
              Set up payments
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}

        <UpcomingOperationsCard events={operations} href="/operations" />

        {dashboard.emptyState ? (
          <>
            <EmptyDashboardState
              mode={dashboard.emptyState}
              organizationName={dashboard.organizationName}
              stripeReady={dashboard.stripe.ready}
              hasProperties={dashboard.counts.properties > 0}
              hasUnits={dashboard.counts.units > 0}
            />
            {dashboard.urgentTasks.length ? <UrgentTasksPanel tasks={dashboard.urgentTasks} /> : null}
          </>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={Building2}
                label="Occupancy"
                value={formatPercent(kpis.occupancy.rate)}
                detail={`${kpis.occupancy.occupiedUnits} of ${kpis.occupancy.rentableUnits} units occupied`}
                href="/units"
                tone={kpis.occupancy.rate >= 0.95 ? "success" : kpis.occupancy.rate >= 0.85 ? "warning" : "danger"}
              />
              <KpiCard
                icon={Banknote}
                label={`Collected · ${range.label.toLowerCase()}`}
                value={formatCurrency(kpis.collected.total)}
                detail={
                  kpis.collected.rateOfExpected !== null
                    ? `${Math.round(kpis.collected.rateOfExpected * 100)}% of ${formatCurrency(kpis.collected.expected)} expected`
                    : `${kpis.collected.count} payment${kpis.collected.count === 1 ? "" : "s"} received`
                }
                href={paidHref}
                tone="brand"
                trend={kpis.collected.trend}
                sparkline={dashboard.collectedSparkline}
              />
              <KpiCard
                icon={ReceiptText}
                label="Outstanding rent"
                value={formatCurrency(kpis.outstanding.total)}
                detail={`${kpis.outstanding.count} open charge${kpis.outstanding.count === 1 ? "" : "s"} · ${kpis.outstanding.partiesAffected} tenant${kpis.outstanding.partiesAffected === 1 ? "" : "s"}`}
                href="/transactions"
                tone={kpis.outstanding.total ? "warning" : "success"}
              />
              <KpiCard
                icon={AlertCircle}
                label="Overdue rent"
                value={formatCurrency(kpis.overdue.total)}
                detail={
                  kpis.overdue.count
                    ? `${kpis.overdue.count} late charge${kpis.overdue.count === 1 ? "" : "s"} · ${kpis.overdue.partiesAffected} tenant${kpis.overdue.partiesAffected === 1 ? "" : "s"}`
                    : "Nothing past due"
                }
                href="/transactions?status=overdue"
                tone={kpis.overdue.total ? "danger" : "success"}
              />
              <KpiCard
                icon={Wrench}
                label="Open maintenance"
                value={String(kpis.maintenance.open)}
                detail={kpis.maintenance.urgent ? `${kpis.maintenance.urgent} urgent or high priority` : "No urgent work orders"}
                href="/maintenance?status=active"
                tone={kpis.maintenance.urgent ? "danger" : kpis.maintenance.open ? "warning" : "success"}
              />
              <KpiCard
                icon={CalendarClock}
                label="Lease expirations · 60d"
                value={String(kpis.leaseExpirations.within60)}
                detail={`${kpis.leaseExpirations.within30} within 30 days · ${kpis.leaseExpirations.within90} within 90`}
                href="/leases"
                tone={kpis.leaseExpirations.within30 ? "warning" : "info"}
              />
              <KpiCard
                icon={TrendingUp}
                label={`Net cash flow · ${range.label.toLowerCase()}`}
                value={formatCurrency(kpis.netCashFlow.net)}
                detail={
                  kpis.netCashFlow.hasExpenseData
                    ? `${formatCurrency(kpis.netCashFlow.collected)} in − ${formatCurrency(kpis.netCashFlow.expenses)} expenses`
                    : "Income only — no expense records yet"
                }
                href="/reports"
                tone={kpis.netCashFlow.net >= 0 ? "success" : "danger"}
                trend={kpis.netCashFlow.trend}
              />
              <NexusInsightCard insight={dashboard.insight} />
            </section>

            <section className="grid items-start gap-[var(--layout-gap,1rem)] xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
              <DetailSection
                title="Cash flow overview"
                description={`Collected income, expenses, and net cash flow · ${formatDate(range.start)} to ${formatDate(range.end)}.`}
                actions={
                  <Link href="/reports" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
                    Open reports
                  </Link>
                }
              >
                <DashboardCashFlowChart data={dashboard.cashFlowSeries} showExpenses={kpis.netCashFlow.hasExpenseData} />
                {!kpis.netCashFlow.hasExpenseData ? (
                  <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                    No expenses recorded yet, so this shows collected income only.{" "}
                    <Link href="/expenses" className="font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
                      Add expenses
                    </Link>{" "}
                    to track true net cash flow.
                  </p>
                ) : null}
              </DetailSection>

              <DetailSection title="Rent status" description={`Where this period's rent stands · ${range.label.toLowerCase()}.`}>
                <RentStatusChart
                  segments={dashboard.rentStatusBreakdown.segments}
                  centerLabel={formatCurrency(dashboard.rentStatusBreakdown.totalTracked)}
                />
                {dashboard.rentStatusBreakdown.segments.length ? (
                  <div className="mt-4">
                    {dashboard.rentStatusBreakdown.segments.map((segment) => (
                      <Link
                        key={segment.key}
                        href={rentStatusHrefs[segment.key] ?? "/transactions"}
                        className="group flex items-center gap-2.5 border-b border-[var(--line)] px-1 py-2 last:border-b-0 hover:bg-[var(--surface-hover)]"
                      >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${rentStatusDotColors[segment.key] ?? "bg-[var(--line-strong)]"}`} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)] transition group-hover:text-[var(--brand)]">
                          {segment.label}
                          <span className="ml-1.5 text-xs text-[var(--muted)]">({segment.count})</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">{formatCurrency(segment.amount)}</span>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
                          {dashboard.rentStatusBreakdown.totalTracked
                            ? `${Math.round((segment.amount / dashboard.rentStatusBreakdown.totalTracked) * 100)}%`
                            : "—"}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </DetailSection>
            </section>

            <section className="grid items-start gap-[var(--layout-gap,1rem)] lg:grid-cols-2 xl:grid-cols-3">
              <UrgentTasksPanel tasks={dashboard.urgentTasks} />
              <PortfolioPulseCard pulse={dashboard.portfolioPulse} />
              <QuickActionsCard />
            </section>

            <section className="grid items-start gap-[var(--layout-gap,1rem)] xl:grid-cols-2">
              <MaintenanceQueueCard queue={dashboard.maintenanceQueue} openCount={kpis.maintenance.open} />
              <LeaseExpirationsTable rows={dashboard.leaseExpirations} />
            </section>

            <PropertyPerformanceTable rows={dashboard.propertyPerformance} rangeLabel={range.label} />

            <section className="grid items-start gap-[var(--layout-gap,1rem)] xl:grid-cols-2">
              <RecentActivityFeed items={dashboard.recentActivity} />
              <TenantMessagesCard messages={dashboard.tenantMessages} unreadCount={dashboard.unreadMessageCount} />
            </section>
          </>
        )}

      </div>
    );
  }

  const snapshot = await timeAsync("[perf:dashboard] getDashboardSnapshot", () =>
    getDashboardSnapshot(user.organizationId)
  );
  const totalDataPrepMs = performance.now() - dataPrepStart;
  console.log(`[perf:dashboard] totalDataPrep: ${Math.round(totalDataPrepMs)}ms`);
  logDashboardPerfSummary(totalDataPrepMs);
  const trend =
    user.role === "ADMIN"
      ? snapshot.charts.cashFlowTrend
      : snapshot.charts.cashFlowTrend.map((row) => ({
          ...row,
          rent: row.rent * Math.max(portal.metrics.totalProperties, 1) / Math.max(snapshot.metrics.totalProperties, 1),
          expenses: row.expenses * Math.max(portal.metrics.totalProperties, 1) / Math.max(snapshot.metrics.totalProperties, 1)
        }));

  const collectionRate = portal.metrics.recurringRent
    ? Math.min(100, Math.round((portal.metrics.collected / portal.metrics.recurringRent) * 100))
    : 0;
  const renewalCount = portal.expiringLeases.filter((lease) => lease.daysRemaining <= 60).length;
  const tenantBalance = portal.nextPayment?.balanceDue ?? portal.nextPayment?.amount ?? 0;

  const heroMetrics =
    user.role === "TENANT"
      ? [
          { label: "Balance", value: formatCurrency(tenantBalance), detail: portal.nextPayment ? `Due ${formatDate(portal.nextPayment.dueDate)}` : "Paid up" },
          { label: "Lease", value: portal.currentLease?.status ?? "Review", detail: portal.currentUnit ? `Unit ${portal.currentUnit.unitNumber}` : "Contact management" },
          { label: "Requests", value: String(portal.scope.maintenance.length), detail: "Maintenance records" }
        ]
      : [
          { label: "Occupancy", value: `${Math.round(portal.metrics.occupancyRate * 100)}%`, detail: `${portal.metrics.occupiedUnits}/${portal.metrics.totalUnits} units` },
          { label: "Collections", value: `${collectionRate}%`, detail: `${formatCurrency(portal.metrics.collected)} this month` },
          { label: "Open work", value: String(portal.metrics.maintenanceOpen), detail: `${renewalCount} renewals due` }
        ];

  const primaryActions =
    user.role === "ADMIN" ? (
      <>
        <Link href="/reports">
          <Button variant="secondary"><FileText className="h-4 w-4" /> Reports</Button>
        </Link>
        <Link href="/settings">
          <Button><ShieldCheck className="h-4 w-4" /> Platform</Button>
        </Link>
      </>
    ) : (
      <>
        <Link href="/maintenance">
          <Button variant="secondary"><Wrench className="h-4 w-4" /> Request service</Button>
        </Link>
        {portal.nextPayment ? (
          hasAcceptedCurrentPaymentTerms(user) ? (
            <form action={createStripeCheckoutAction}>
              <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
              <SubmitButton pendingLabel="Opening Stripe..."><CreditCard className="h-4 w-4" /> Pay rent</SubmitButton>
            </form>
          ) : (
            // Checkout requires the one-time payment-terms acknowledgement, which
            // lives on the transactions pay form — send the user there until then.
            <Link href="/transactions#pay-now">
              <Button><CreditCard className="h-4 w-4" /> Pay rent</Button>
            </Link>
          )
        ) : (
          <Button disabled><CreditCard className="h-4 w-4" /> Paid up</Button>
        )}
      </>
    );

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="surface-panel dashboard-hero-main">
          <div>
            <h1 className="page-title font-semibold text-[var(--text)]">Dashboard</h1>
          </div>
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="hero-kpi-strip min-w-0 flex-1">
              {heroMetrics.map((metric) => (
                <div key={metric.label} className="hero-kpi">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{metric.value}</p>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">{metric.detail}</p>
                </div>
              ))}
            </div>
            <div className="page-actions shrink-0">{primaryActions}</div>
          </div>
        </div>
        <div className="surface-panel dashboard-hero-media">
          <div className="relative h-full overflow-hidden rounded-md">
            <img src="/demo/property-cover.svg" alt="" />
            <div className="absolute bottom-3 left-3 right-3 rounded-md border border-white/70 bg-white/90 p-3 shadow-[0_14px_28px_rgba(20,33,30,0.12)]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent-blue)] text-[var(--info)]">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">{user.organization.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{portal.metrics.totalProperties} properties - {portal.metrics.totalUnits} units</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {params.q && searchResults ? (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Search results</p>
              <h2 className="mt-1 text-xl font-semibold">Matches for "{params.q}"</h2>
            </div>
            <Badge tone="default">Global search</Badge>
          </div>
          <div className="card-grid-3 mt-4">
            <div className="panel-muted p-4">
              <p className="text-sm font-semibold">Properties</p>
              <div className="mt-3 space-y-2">
                {searchResults.properties.length ? searchResults.properties.map((item) => <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm transition hover:border-[var(--brand)]">{item.name}</Link>) : <p className="text-sm text-[var(--muted)]">No property matches.</p>}
              </div>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm font-semibold">Units</p>
              <div className="mt-3 space-y-2">
                {searchResults.units.length ? searchResults.units.map((item) => <Link key={item.id} href={`/units/${item.id}`} className="block rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm transition hover:border-[var(--brand)]">{item.property.name} {item.unitNumber}</Link>) : <p className="text-sm text-[var(--muted)]">No unit matches.</p>}
              </div>
            </div>
            <div className="panel-muted p-4">
              <p className="text-sm font-semibold">Tenants</p>
              <div className="mt-3 space-y-2">
                {searchResults.tenants.length ? searchResults.tenants.map((item) => <Link key={item.id} href="/tenants" className="block rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm transition hover:border-[var(--brand)]">{item.firstName} {item.lastName}</Link>) : <p className="text-sm text-[var(--muted)]">No tenant matches.</p>}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <section className="metric-grid">
        {user.role === "ADMIN" ? (
          <>
            <MetricCard label="Properties" value={String(portal.metrics.totalProperties)} hint="Total assets under management" accent="brand" />
            <MetricCard label="Units" value={String(portal.metrics.totalUnits)} hint={`${portal.metrics.occupiedUnits} occupied and actively tracked`} />
            <MetricCard label="Occupancy" value={`${Math.round(portal.metrics.occupancyRate * 100)}%`} hint="Current occupied unit share" accent="success" />
            <MetricCard label="Delinquency" value={`${Math.round(portal.metrics.delinquencyRate * 100)}%`} hint="Payments requiring collections attention" accent="warning" />
            <MetricCard label="Rent billed" value={formatCurrency(portal.metrics.recurringRent)} hint="Current scheduled monthly rent" accent="brand" />
            <MetricCard label="Collected" value={formatCurrency(portal.metrics.collected)} hint={`Outstanding ${formatCurrency(portal.metrics.outstanding)}`} accent="success" />
            <MetricCard label="Maintenance" value={String(portal.metrics.maintenanceOpen)} hint="Open or in-progress service requests" accent="warning" />
            <MetricCard label="Expenses" value={formatCurrency(portal.metrics.monthExpenses)} hint="Current-month operating expense activity" />
          </>
        ) : (
          <>
            <MetricCard label="Rent due" value={formatCurrency(tenantBalance)} hint={portal.nextPayment ? `Due ${formatDate(portal.nextPayment.dueDate)}` : "No outstanding payment currently due"} accent="warning" />
            <MetricCard label="Next payment" value={portal.nextPayment ? formatDate(portal.nextPayment.dueDate) : "Paid up"} hint="Your next resident billing milestone" accent="brand" />
            <MetricCard
              label="Lease status"
              value={portal.currentLease?.status ?? "No active lease"}
              hint={
                portal.currentLease
                  ? `${portal.currentLease.startDate ? formatDate(portal.currentLease.startDate) : "Not set"} to ${portal.currentLease.endDate ? formatDate(portal.currentLease.endDate) : "Not set"}`
                  : "Contact management for assistance"
              }
              accent="success"
            />
            <MetricCard label="Maintenance" value={String(portal.scope.maintenance.length)} hint="Requests currently tied to your unit" />
          </>
        )}
      </section>

      <section className="content-split">
        <Card className="chart-panel p-5 lg:p-6">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker">{user.role === "TENANT" ? "Payment overview" : "Financial momentum"}</p>
              <h2 className="mt-2 text-2xl font-semibold">{user.role === "TENANT" ? "Recent account movement" : "Rent and operating spend"}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                {user.role === "TENANT" ? "A quick view of recent billing activity tied to your lease." : "Collections and expenses plotted together so cash movement is easy to scan."}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-[var(--muted)]">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" /> Rent</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--info)]" /> Expenses</span>
            </div>
          </div>
          <CashFlowChart data={trend} />
        </Card>

        <Card className="p-5 lg:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">{user.role === "TENANT" ? "Notices" : "Priority queue"}</p>
              <h2 className="mt-2 text-xl font-semibold">{user.role === "TENANT" ? "Building updates" : "Decisions to make"}</h2>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--brand)]">
              {user.role === "TENANT" ? <BellRing className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
            </span>
          </div>
          <div>
            {user.role === "TENANT" ? (
              portal.announcements.length ? portal.announcements.map((item) => (
                <div key={item.id} className="queue-item">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                    </div>
                    <Badge tone="default">{getNotificationLabel(item)}</Badge>
                  </div>
                </div>
              )) : <EmptyState icon={CheckCircle2} title="No active notices" description="You are caught up on building announcements." />
            ) : portal.expiringLeases.length ? (
              portal.expiringLeases.slice(0, 5).map((lease) => (
                <div key={lease.id} className="queue-item">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">Lease ending {formatDate(lease.endDate!)}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                        {portal.scope.units.find((unit) => unit.id === lease.unitId)?.unitNumber ?? "Unit"} renewal decision due in {Math.max(lease.daysRemaining, 0)} days
                      </p>
                    </div>
                    <Badge tone={lease.daysRemaining <= 30 ? "warning" : "default"}>{Math.max(lease.daysRemaining, 0)}d</Badge>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState icon={CheckCircle2} title="No near-term expirations" description="There are no active leases nearing end date in the current role scope." />
            )}
          </div>
        </Card>
      </section>

      <section className="card-grid-3">
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">{user.role === "TENANT" ? "Lease and home" : "Recent payments"}</p>
              <h2 className="mt-2 text-xl font-semibold">{user.role === "TENANT" ? "Payment history" : "Collection activity"}</h2>
            </div>
            <ReceiptText className="h-5 w-5 text-[var(--brand)]" />
          </div>
          <div>
            {(user.role === "TENANT" ? portal.scope.payments.slice(0, 4) : portal.scope.payments.slice(0, 6)).map((payment) => (
              <div key={payment.id} className="queue-item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{payment.description}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {formatDate(payment.dueDate)} - {payment.stripeCheckoutSessionId ? "Stripe checkout" : "Manual ledger"}
                    </p>
                  </div>
                  <Badge tone={badgeToneFromPayment(payment.status)}>{payment.status === "PAID" ? "Paid" : "Unpaid"}</Badge>
                </div>
                <p className="mt-3 text-lg font-semibold">{formatCurrency(payment.amount)}</p>
              </div>
            ))}
            {portal.scope.payments.length === 0 ? <EmptyState icon={ReceiptText} title="No payment history" description="Payment activity will appear here." /> : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">{user.role === "TENANT" ? "Service requests" : "Maintenance activity"}</p>
              <h2 className="mt-2 text-xl font-semibold">{user.role === "TENANT" ? "Request status" : "Work order flow"}</h2>
            </div>
            <Wrench className="h-5 w-5 text-[var(--warning)]" />
          </div>
          <div>
            {portal.scope.maintenance.slice(0, 6).map((item) => (
              <div key={item.id} className="queue-item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(item.requestedAt)}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge tone={badgeToneFromPriority(item.priority)}>{item.priority}</Badge>
                    <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
              </div>
            ))}
            {portal.scope.maintenance.length === 0 ? <EmptyState icon={Wrench} title="No current requests" description="Your role scope does not have any maintenance items right now." /> : null}
          </div>
        </Card>

        <Card className="p-5" id="announcements">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">{user.role === "ADMIN" ? "Audit and activity" : "Messages and notices"}</p>
              <h2 className="mt-2 text-xl font-semibold">{user.role === "ADMIN" ? "Latest changes" : "Resident communication"}</h2>
            </div>
            {user.role === "ADMIN" ? <MessageSquare className="h-5 w-5 text-[var(--info)]" /> : <Home className="h-5 w-5 text-[var(--info)]" />}
          </div>
          <div>
            {(user.role === "ADMIN" ? portal.recentActivity : portal.messageCenter).map((item: any) => (
              <div key={item.id} className="queue-item">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{item.title}</p>
                  <Badge tone="default">{user.role === "ADMIN" ? item.kind : getNotificationLabel(item)}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{user.role === "ADMIN" ? item.detail : item.body}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">{formatDate(user.role === "ADMIN" ? item.date : item.createdAt)}</p>
              </div>
            ))}
            {(user.role === "ADMIN" ? portal.recentActivity : portal.messageCenter).length === 0 ? <EmptyState icon={MessageSquare} title="No recent activity" description="New updates will appear here." /> : null}
          </div>
        </Card>
      </section>

      <UpcomingOperationsCard
        events={operations}
        href={user.role === "ADMIN" ? "/operations" : undefined}
        title={user.role === "TENANT" ? "Upcoming Dates" : "Upcoming Operations"}
      />

      <div className="flex justify-end">
        <Link href={user.role === "TENANT" ? "/messages" : "/reports"} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]">
          {user.role === "TENANT" ? "Open messages" : "Open full reporting"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
