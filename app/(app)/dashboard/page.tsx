import Link from "next/link";

import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getRoleConfig } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getDashboardSnapshot } from "@/services/finance";
import { badgeToneFromMaintenance, badgeToneFromPayment, getNotificationLabel, getPortalContext } from "@/services/portal";
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

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={role.homeLabel}
        title={
          user.role === "ADMIN"
            ? "Portfolio visibility and operating control."
            : user.role === "MANAGER"
              ? "Assigned-property operations, prioritized for execution."
              : "Everything you need for rent, maintenance, and lease self-service."
        }
        description={
          user.role === "ADMIN"
            ? "Track occupancy, collections, leasing risk, maintenance volume, and team activity from one dashboard."
            : user.role === "MANAGER"
              ? "Stay on top of overdue rent, work orders, expiring leases, and resident follow-up for the properties currently assigned to you."
              : "Review your balance, next payment, active lease details, service requests, and recent building announcements without the operational noise."
        }
        actions={
          user.role === "ADMIN" ? (
            <>
              <Link href="/reports">
                <Button variant="secondary">Open reporting</Button>
              </Link>
              <Link href="/settings">
                <Button>Manage platform</Button>
              </Link>
            </>
          ) : user.role === "MANAGER" ? (
            <>
              <Link href="/maintenance">
                <Button variant="secondary">Review work orders</Button>
              </Link>
              <Link href="/leases">
                <Button>Renewal queue</Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/maintenance">
                <Button variant="secondary">Submit request</Button>
              </Link>
              <Link href="/transactions">
                <Button>Pay rent</Button>
              </Link>
            </>
          )
        }
      />

      {params.q && searchResults ? (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Search results</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm font-semibold">Properties</p>
              <div className="mt-3 space-y-2">
                {searchResults.properties.length ? searchResults.properties.map((item) => <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-xl bg-white px-3 py-2 text-sm">{item.name}</Link>) : <p className="text-sm text-[var(--muted)]">No property matches.</p>}
              </div>
            </div>
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm font-semibold">Units</p>
              <div className="mt-3 space-y-2">
                {searchResults.units.length ? searchResults.units.map((item) => <Link key={item.id} href={`/units/${item.id}`} className="block rounded-xl bg-white px-3 py-2 text-sm">{item.property.name} {item.unitNumber}</Link>) : <p className="text-sm text-[var(--muted)]">No unit matches.</p>}
              </div>
            </div>
            <div className="panel-muted rounded-[24px] p-4">
              <p className="text-sm font-semibold">Tenants</p>
              <div className="mt-3 space-y-2">
                {searchResults.tenants.length ? searchResults.tenants.map((item) => <Link key={item.id} href="/tenants" className="block rounded-xl bg-white px-3 py-2 text-sm">{item.firstName} {item.lastName}</Link>) : <p className="text-sm text-[var(--muted)]">No tenant matches.</p>}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {user.role === "ADMIN" ? (
          <>
            <MetricCard label="Properties" value={String(portal.metrics.totalProperties)} hint="Total assets under management" accent="brand" />
            <MetricCard label="Units" value={String(portal.metrics.totalUnits)} hint={`${portal.metrics.occupiedUnits} occupied and actively tracked`} />
            <MetricCard label="Occupancy" value={`${Math.round(portal.metrics.occupancyRate * 100)}%`} hint="Current occupied unit share" accent="success" />
            <MetricCard label="Delinquency" value={`${Math.round(portal.metrics.delinquencyRate * 100)}%`} hint="Payments requiring collections attention" accent="warning" />
            <MetricCard label="Rent billed" value={formatCurrency(portal.metrics.recurringRent)} hint="Current scheduled monthly rent" accent="brand" />
            <MetricCard label="Collected" value={formatCurrency(portal.metrics.collected)} hint={`Outstanding ${formatCurrency(portal.metrics.outstanding)}`} accent="success" />
            <MetricCard label="Maintenance volume" value={String(portal.metrics.maintenanceOpen)} hint="Open or in-progress service requests" accent="warning" />
            <MetricCard label="Monthly expenses" value={formatCurrency(portal.metrics.monthExpenses)} hint="Current-month operating expense activity" />
          </>
        ) : user.role === "MANAGER" ? (
          <>
            <MetricCard label="Assigned properties" value={String(portal.metrics.totalProperties)} hint="Buildings currently in your operating scope" accent="brand" />
            <MetricCard label="Assigned units" value={String(portal.metrics.totalUnits)} hint={`${portal.metrics.occupiedUnits} occupied right now`} />
            <MetricCard label="Open maintenance" value={String(portal.metrics.maintenanceOpen)} hint="Issues waiting on triage or vendor progress" accent="warning" />
            <MetricCard label="Overdue rent" value={formatCurrency(portal.metrics.overdue)} hint="Collections needing immediate follow-up" accent="warning" />
            <MetricCard label="Lease expirations" value={String(portal.expiringLeases.filter((lease) => lease.daysRemaining <= 60).length)} hint="Renewals approaching within 60 days" />
            <MetricCard label="Collected" value={formatCurrency(portal.metrics.collected)} hint="Payments collected inside your portfolio scope" accent="success" />
            <MetricCard label="Announcements" value={String(portal.notifications.length)} hint="Messages and system updates in your queue" accent="brand" />
            <MetricCard label="Occupancy" value={`${Math.round(portal.metrics.occupancyRate * 100)}%`} hint="Occupied share of your assigned units" accent="success" />
          </>
        ) : (
          <>
            <MetricCard label="Rent due" value={formatCurrency(portal.nextPayment?.balanceDue ?? portal.nextPayment?.amount ?? 0)} hint={portal.nextPayment ? `Due ${formatDate(portal.nextPayment.dueDate)}` : "No outstanding payment currently due"} accent="warning" />
            <MetricCard label="Next payment" value={portal.nextPayment ? formatDate(portal.nextPayment.dueDate) : "Paid up"} hint="Your next resident billing milestone" accent="brand" />
            <MetricCard label="Lease status" value={portal.currentLease?.status ?? "No active lease"} hint={portal.currentLease ? `${formatDate(portal.currentLease.startDate)} to ${formatDate(portal.currentLease.endDate)}` : "Contact management for assistance"} accent="success" />
            <MetricCard label="Maintenance" value={String(portal.scope.maintenance.length)} hint="Requests currently tied to your unit" />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-6 lg:p-7">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "Payment overview" : "Collections and spend trend"}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{user.role === "TENANT" ? "Recent account movement" : "Rent versus expense momentum"}</h2>
            </div>
            {user.role === "ADMIN" ? <Link href="/reports" className="text-sm font-semibold text-[var(--brand)]">Open reports</Link> : null}
          </div>
          <CashFlowChart data={trend} />
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "Announcements" : "Priority queue"}</p>
          <div className="mt-4 space-y-3">
            {(user.role === "TENANT" ? portal.announcements : portal.expiringLeases.slice(0, 5)).map((item: any) => (
              <div key={item.id} className="panel-muted rounded-[24px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{user.role === "TENANT" ? item.title : `Lease ending ${formatDate(item.endDate)}`}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {user.role === "TENANT"
                        ? item.body
                        : `${portal.scope.units.find((unit) => unit.id === item.unitId)?.unitNumber ?? "Unit"} renewal decision due in ${Math.max(item.daysRemaining, 0)} days`}
                    </p>
                  </div>
                  <Badge tone={user.role === "TENANT" ? "default" : "warning"}>
                    {user.role === "TENANT" ? getNotificationLabel(item) : `${Math.max(item.daysRemaining, 0)}d`}
                  </Badge>
                </div>
              </div>
            ))}
            {user.role !== "TENANT" && portal.expiringLeases.length === 0 ? <EmptyState title="No near-term expirations" description="There are no active leases nearing end date in the current role scope." /> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "Lease and home" : "Recent payments"}</p>
          <div className="mt-4 space-y-3">
            {(user.role === "TENANT" ? portal.scope.payments.slice(0, 4) : portal.scope.payments.slice(0, 6)).map((payment) => (
              <div key={payment.id} className="panel-muted rounded-[24px] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{payment.description}</p>
                    <p className="text-sm text-[var(--muted)]">{formatDate(payment.dueDate)}</p>
                  </div>
                  <Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge>
                </div>
                <p className="mt-3 text-lg font-semibold">{formatCurrency(payment.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "TENANT" ? "Service requests" : "Maintenance activity"}</p>
          <div className="mt-4 space-y-3">
            {portal.scope.maintenance.slice(0, 6).map((item) => (
              <div key={item.id} className="panel-muted rounded-[24px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-[var(--muted)]">{formatDate(item.requestedAt)}</p>
                  </div>
                  <Badge tone={badgeToneFromMaintenance(item.status)}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
              </div>
            ))}
            {portal.scope.maintenance.length === 0 ? <EmptyState title="No current requests" description="Your role scope does not have any maintenance items right now." /> : null}
          </div>
        </Card>
        <Card className="p-6" id="announcements">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">{user.role === "ADMIN" ? "Audit and activity" : "Messages and notices"}</p>
          <div className="mt-4 space-y-3">
            {(user.role === "ADMIN" ? portal.recentActivity : portal.messageCenter).map((item: any) => (
              <div key={item.id} className="panel-muted rounded-[24px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{item.title}</p>
                  <Badge tone="default">{user.role === "ADMIN" ? item.kind : getNotificationLabel(item)}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{user.role === "ADMIN" ? item.detail : item.body}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">{formatDate(user.role === "ADMIN" ? item.date : item.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
