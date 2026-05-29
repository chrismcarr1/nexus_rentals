import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wrench
} from "lucide-react";

import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createStripeCheckoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getRoleConfig } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getDashboardSnapshot } from "@/services/finance";
import {
  badgeToneFromMaintenance,
  badgeToneFromPayment,
  badgeToneFromPriority,
  getNotificationLabel,
  getPortalContext
} from "@/services/portal";
import { globalSearch } from "@/services/search";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const role = getRoleConfig(user.role);
  const portal = await getPortalContext(user);
  const snapshot = await getDashboardSnapshot(user.organizationId);
  const searchResults =
    params.q && user.role !== "TENANT"
      ? await globalSearch(user.organizationId, params.q, {
          propertyIds: portal.scope.properties.map((item) => item.id),
          unitIds: portal.scope.units.map((item) => item.id),
          tenantIds: portal.scope.tenants.map((item) => item.id)
        })
      : null;

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

  const dashboardCopy =
    user.role === "ADMIN"
      ? {
          title: "Portfolio command center",
          description: "A clean operating view across occupancy, collections, renewals, maintenance, and team activity.",
          eyebrow: role.homeLabel
        }
      : user.role === "MANAGER"
        ? {
            title: "Today's operating board",
            description: "Your assigned properties, overdue balances, open service work, and renewal decisions in one focused workspace.",
            eyebrow: role.homeLabel
          }
        : {
            title: "Your rental home base",
            description: "Track rent, lease status, service requests, notices, and messages without digging through separate portals.",
            eyebrow: role.homeLabel
          };

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
    ) : user.role === "MANAGER" ? (
      <>
        <Link href="/maintenance">
          <Button variant="secondary"><Wrench className="h-4 w-4" /> Work orders</Button>
        </Link>
        <Link href="/leases">
          <Button><FileText className="h-4 w-4" /> New lease</Button>
        </Link>
      </>
    ) : (
      <>
        <Link href="/maintenance">
          <Button variant="secondary"><Wrench className="h-4 w-4" /> Request service</Button>
        </Link>
        {portal.nextPayment ? (
          <form action={createStripeCheckoutAction}>
            <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
            <SubmitButton pendingLabel="Opening Stripe..."><CreditCard className="h-4 w-4" /> Pay rent</SubmitButton>
          </form>
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
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
              <Sparkles className="h-3.5 w-3.5" />
              {dashboardCopy.eyebrow}
            </div>
            <h1 className="page-title mt-5 font-semibold text-[var(--text)]">{dashboardCopy.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] lg:text-[15px]">{dashboardCopy.description}</p>
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
        ) : user.role === "MANAGER" ? (
          <>
            <MetricCard label="Assigned properties" value={String(portal.metrics.totalProperties)} hint="Buildings currently in your operating scope" accent="brand" />
            <MetricCard label="Assigned units" value={String(portal.metrics.totalUnits)} hint={`${portal.metrics.occupiedUnits} occupied right now`} />
            <MetricCard label="Open maintenance" value={String(portal.metrics.maintenanceOpen)} hint="Issues waiting on triage or vendor progress" accent="warning" />
            <MetricCard label="Overdue rent" value={formatCurrency(portal.metrics.overdue)} hint="Collections needing immediate follow-up" accent="warning" />
            <MetricCard label="Renewals" value={String(renewalCount)} hint="Leases approaching within 60 days" />
            <MetricCard label="Collected" value={formatCurrency(portal.metrics.collected)} hint="Payments collected inside your portfolio scope" accent="success" />
            <MetricCard label="Announcements" value={String(portal.notifications.length)} hint="Messages and system updates in your queue" accent="brand" />
            <MetricCard label="Occupancy" value={`${Math.round(portal.metrics.occupancyRate * 100)}%`} hint="Occupied share of your assigned units" accent="success" />
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
              )) : <EmptyState title="No active notices" description="You are caught up on building announcements." />
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
              <EmptyState title="No near-term expirations" description="There are no active leases nearing end date in the current role scope." />
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
            {portal.scope.payments.length === 0 ? <EmptyState title="No payment history" description="Payment activity will appear here." /> : null}
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
            {portal.scope.maintenance.length === 0 ? <EmptyState title="No current requests" description="Your role scope does not have any maintenance items right now." /> : null}
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
            {(user.role === "ADMIN" ? portal.recentActivity : portal.messageCenter).length === 0 ? <EmptyState title="No recent activity" description="New updates will appear here." /> : null}
          </div>
        </Card>
      </section>

      <div className="flex justify-end">
        <Link href={user.role === "TENANT" ? "/messages" : "/reports"} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]">
          {user.role === "TENANT" ? "Open messages" : "Open full reporting"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
