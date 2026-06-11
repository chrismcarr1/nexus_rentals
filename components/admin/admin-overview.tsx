import Link from "next/link";
import { ArrowRight, CircleAlert, MailWarning, ShieldAlert } from "lucide-react";

import { AdminAnalyticsChart } from "@/components/charts/lazy-charts";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatGrid } from "@/components/admin/admin-stat-grid";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { EmptyState } from "@/components/empty-state";
import type { AdminAnalytics } from "@/lib/admin-analytics";
import { formatAppDateTime } from "@/lib/app-time";
import { formatCurrency } from "@/lib/utils";

export function AdminOverview({ data }: { data: AdminAnalytics }) {
  const attention = [
    {
      label: "Critical data issues",
      value: data.operations.critical,
      detail: "Broken relationships or invalid money records",
      href: "/admin/operations",
      icon: ShieldAlert,
      tone: data.operations.critical ? "danger" : "success"
    },
    {
      label: "Overdue balance",
      value: formatCurrency(data.overview.overdueBalance),
      detail: "Open charges already past due",
      href: "/admin/payments",
      icon: CircleAlert,
      tone: data.overview.overdueBalance ? "warning" : "success"
    },
    {
      label: "Email failures",
      value: data.overview.failedEmails,
      detail: `${data.rangeLabel.toLowerCase()} delivery failures`,
      href: "/admin/email",
      icon: MailWarning,
      tone: data.overview.failedEmails ? "danger" : "success"
    },
    {
      label: "Stripe setup needed",
      value: data.overview.stripeNeedsOnboarding,
      detail: "Manager connected accounts not fully ready",
      href: "/admin/stripe",
      icon: CircleAlert,
      tone: data.overview.stripeNeedsOnboarding ? "warning" : "success"
    }
  ] as const;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Platform overview"
        description="A live operating view of Nexus growth, activation, rent activity, payments, Stripe readiness, email delivery, and platform integrity."
        actions={<AdminFilterBar action="/admin" range={data.range} />}
      />

      <AdminStatGrid>
        <AdminMetricCard label="Managers" value={data.overview.managers} detail={`${data.overview.activeManagers} active accounts`} tone="brand" />
        <AdminMetricCard label="Tenants" value={data.overview.tenants} detail={`${data.overview.activeTenants} active accounts`} tone="blue" />
        <AdminMetricCard label="Properties" value={data.overview.properties} detail={`${data.overview.newProperties} added ${data.rangeLabel.toLowerCase()}`} />
        <AdminMetricCard label="Units" value={data.overview.units} detail={`${data.overview.activeLeases} active leases`} />
        <AdminMetricCard label="Payment requests" value={data.overview.paymentsCreated} detail={`${data.overview.paymentsCollected} paid records`} />
        <AdminMetricCard label="Collected volume" value={formatCurrency(data.overview.paymentVolume)} detail={data.rangeLabel} tone="success" />
        <AdminMetricCard label="Stripe volume" value={formatCurrency(data.overview.stripePaymentVolume)} detail={`${formatCurrency(data.overview.platformRevenue)} platform fees`} tone="brand" />
        <AdminMetricCard label="Open balance" value={formatCurrency(data.overview.openBalance)} detail={`${formatCurrency(data.overview.overdueBalance)} overdue`} tone={data.overview.overdueBalance ? "warning" : "success"} />
        <AdminMetricCard label="New users" value={data.overview.newUsers} detail={data.rangeLabel} tone="blue" />
        <AdminMetricCard label="Applications" value={data.overview.applicationsSubmitted} detail={`Submitted ${data.rangeLabel.toLowerCase()}`} />
        <AdminMetricCard label="Move-ins" value={data.overview.moveInsCreated} detail={`Created ${data.rangeLabel.toLowerCase()}`} />
        <AdminMetricCard label="Integrity issues" value={data.operations.issues.length} detail={`${data.operations.critical} critical, ${data.operations.warnings} warnings`} tone={data.operations.critical ? "danger" : "warning"} />
      </AdminStatGrid>

      <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-2 xl:grid-cols-4">
        {attention.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="group bg-white p-4 hover:bg-[var(--surface)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
                </div>
                <Icon className="h-5 w-5 text-[var(--muted)] group-hover:text-[var(--brand)]" />
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.detail}</p>
            </Link>
          );
        })}
      </section>

      <section className="ops-split">
        <AdminSection
          title="Growth and platform activity"
          description={`New accounts, inventory, leasing, applications, and payment activity for ${data.rangeLabel.toLowerCase()}.`}
          actions={<Link href={`/admin/growth?range=${data.range}`} className="text-sm font-semibold text-[var(--brand)]">Full growth analytics</Link>}
        >
          <AdminAnalyticsChart
            data={data.growth.series}
            series={[
              { key: "managers", label: "Managers" },
              { key: "tenants", label: "Tenants" },
              { key: "properties", label: "Properties" },
              { key: "paymentRequests", label: "Payment requests" }
            ]}
          />
        </AdminSection>

        <AdminSection title="Activation funnel" description="Current conversion from account creation into real operating use.">
          <div className="divide-y divide-[var(--line)]">
            {[
              ["Manager activation", data.growth.managerActivationRate, "Manager added a property"],
              ["Managers with leases", data.growth.managersWithLeaseRate, "Manager created a lease"],
              ["Managers requesting payment", data.growth.managersWithPaymentRate, "Manager created a charge"],
              ["Tenant activation", data.growth.tenantActivationRate, "Tenant account linked to a lease"],
              ["Invite acceptance", data.growth.inviteAcceptanceRate, "Sent invites accepted"]
            ].map(([label, value, detail]) => (
              <div key={String(label)} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-sm font-semibold tabular-nums">{value}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden bg-[var(--surface)]">
                  <div className="h-full bg-[var(--brand)]" style={{ width: `${value}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--muted)]">{detail}</p>
              </div>
            ))}
          </div>
        </AdminSection>
      </section>

      <section className="ops-split">
        <AdminSection
          title="Manager value and setup"
          description="Managers ranked by collected payment volume and current platform setup."
          actions={<Link href="/admin/managers" className="text-sm font-semibold text-[var(--brand)]">View managers</Link>}
        >
          {data.managers.length ? (
            <AdminDataTable columns={["Manager", "Portfolio", "Rent roll", "Collected", "Setup", "Stripe"]} minWidth="48rem">
              {data.managers.slice(0, 8).map((manager) => (
                <tr key={manager.id} className="table-row">
                  <td className="table-cell">
                    <Link href={`/admin/managers/${manager.id}`} className="font-semibold hover:text-[var(--brand)]">{manager.name}</Link>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{manager.email}</p>
                  </td>
                  <td className="table-cell text-[var(--muted)]">{manager.propertyCount} properties / {manager.unitCount} units</td>
                  <td className="table-cell font-semibold">{formatCurrency(manager.rentVolume)}</td>
                  <td className="table-cell font-semibold">{formatCurrency(manager.paymentVolume)}</td>
                  <td className="table-cell">{manager.setupProgress}%</td>
                  <td className="table-cell"><AdminStatusBadge status={manager.stripeStatus} /></td>
                </tr>
              ))}
            </AdminDataTable>
          ) : (
            <EmptyState title="No manager accounts" description="Manager activation data will appear after the first signup." />
          )}
        </AdminSection>

        <AdminSection
          title="Operations queue"
          description="Highest-severity data integrity findings requiring platform review."
          actions={<Link href="/admin/operations" className="text-sm font-semibold text-[var(--brand)]">Open operations center</Link>}
        >
          {data.operations.issues.length ? (
            <div className="divide-y divide-[var(--line)]">
              {data.operations.issues.slice(0, 8).map((issue) => (
                <div key={issue.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{issue.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{issue.detail}</p>
                  </div>
                  <AdminStatusBadge status={issue.severity} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No integrity findings" description="Current platform records pass the implemented integrity checks." />
          )}
        </AdminSection>
      </section>

      <section className="ops-split">
        <AdminSection title="Recent platform activity" description="Latest email, Stripe, payment, and maintenance events.">
          {data.recentActivity.length ? (
            <div className="divide-y divide-[var(--line)]">
              {data.recentActivity.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold capitalize">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <AdminStatusBadge status={item.status} />
                    <p className="mt-1 text-[11px] text-[var(--muted)]">{formatAppDateTime(item.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent activity" description="Operational events will appear here as the platform is used." />
          )}
        </AdminSection>

        <AdminSection title="System readiness" description="Safe configuration checks without exposing secret values.">
          <div className="divide-y divide-[var(--line)]">
            {[
              ["Database", data.system.databaseConnected, data.system.databaseConfigured ? "Connected and configured" : "Connection loaded, environment key missing"],
              ["Application URL", data.system.appUrl.valid, data.system.appUrl.host ?? "APP_URL missing"],
              ["Email", data.system.emailConfigured, data.email.diagnostics.transport],
              ["Stripe API", data.system.stripeApiConfigured, data.system.stripeApiConfigured ? "Configured" : "Missing"],
              ["Stripe webhook", data.system.stripeWebhookConfigured, data.stripe.lastWebhookAt ? `Last event ${formatAppDateTime(data.stripe.lastWebhookAt)}` : "No stored webhook event yet"],
              ["File storage", data.system.blobConfigured || data.system.environment !== "production", data.system.blobConfigured ? "Blob storage configured" : "Local development storage"]
            ].map(([label, healthy, detail]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
                </div>
                <AdminStatusBadge status={healthy ? "Healthy" : "Needs attention"} />
              </div>
            ))}
          </div>
          <Link href="/admin/system-health" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)]">
            Full system health
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AdminSection>
      </section>
    </div>
  );
}
