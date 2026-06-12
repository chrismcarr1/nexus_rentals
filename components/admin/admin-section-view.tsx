import Link from "next/link";
import {
  Download,
  ExternalLink,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  XCircle
} from "lucide-react";

import { AdminAnalyticsChart } from "@/components/charts/lazy-charts";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminHealthCard } from "@/components/admin/admin-health-card";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatGrid } from "@/components/admin/admin-stat-grid";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { CopyRecordIdButton } from "@/components/admin/copy-record-id-button";
import { EmptyState } from "@/components/empty-state";
import { adminRepairStripeAccountAction, sendAdminTestEmailAction, refreshManagerStripeAction, resetManagerStripeConnectAction } from "@/lib/admin-actions";
import type { AdminAnalytics } from "@/lib/admin-analytics";
import { formatAppDate, formatAppDateTime } from "@/lib/app-time";
import type { EmailWorkerProbeResult } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";

export type AdminSectionKey =
  | "growth"
  | "users"
  | "managers"
  | "tenants"
  | "properties"
  | "payments"
  | "applications"
  | "stripe"
  | "email"
  | "operations"
  | "product-analytics"
  | "reports"
  | "system-health"
  | "settings";

function formatDateTime(value?: string | null) {
  return value ? formatAppDateTime(value) : "Not recorded";
}

function includesQuery(values: Array<string | number | null | undefined>, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function SearchField({ action, range, query }: { action: string; range: string; query: string }) {
  return (
    <form action={action} className="flex min-w-0 flex-1 items-center gap-2">
      <input type="hidden" name="range" value={range} />
      <input name="q" defaultValue={query} className="field search-field min-w-52 text-sm" placeholder="Search records" />
      <button type="submit" className="button-compact border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold hover:bg-[var(--surface-hover)]">
        Search
      </button>
    </form>
  );
}

function UnavailableMetric({ label, detail }: { label: string; detail: string }) {
  return <AdminMetricCard label={label} value="Not tracked" detail={detail} tone="warning" />;
}

export function AdminSectionView({
  section,
  data,
  query = "",
  params = {},
  emailProbe
}: {
  section: AdminSectionKey;
  data: AdminAnalytics;
  query?: string;
  params?: Record<string, string | string[] | undefined>;
  emailProbe?: EmailWorkerProbeResult | null;
}) {
  if (section === "growth") {
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Growth analytics"
          description="Account acquisition, portfolio creation, leasing, applications, payments, and activation conversion over time."
          actions={<AdminFilterBar action="/admin/growth" range={data.range} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="New users" value={data.overview.newUsers} detail={data.rangeLabel} tone="brand" />
          <AdminMetricCard label="New properties" value={data.overview.newProperties} detail={data.rangeLabel} />
          <AdminMetricCard label="Applications submitted" value={data.overview.applicationsSubmitted} detail={data.rangeLabel} />
          <AdminMetricCard label="Move-ins created" value={data.overview.moveInsCreated} detail={data.rangeLabel} />
          <AdminMetricCard label="Invite acceptance" value={`${data.growth.inviteAcceptanceRate}%`} detail="Accepted of sent invites" tone="success" />
          <AdminMetricCard label="Password resets" value={data.growth.passwordResetRequests} detail={data.rangeLabel} />
          <AdminMetricCard label="Manager activation" value={`${data.growth.managerActivationRate}%`} detail="Added at least one property" tone="brand" />
          <AdminMetricCard label="Tenant activation" value={`${data.growth.tenantActivationRate}%`} detail="Portal account linked to lease" tone="blue" />
        </AdminStatGrid>
        <AdminSection title="Acquisition and operating growth" description="Daily or monthly creation counts based on the selected period.">
          <AdminAnalyticsChart
            data={data.growth.series}
            series={[
              { key: "managers", label: "Managers" },
              { key: "tenants", label: "Tenants" },
              { key: "properties", label: "Properties" },
              { key: "units", label: "Units" },
              { key: "leases", label: "Leases" },
              { key: "applications", label: "Applications" }
            ]}
          />
        </AdminSection>
        <AdminSection title="Payment workflow growth" description="Payment requests created compared with completed payments.">
          <AdminAnalyticsChart
            data={data.growth.series}
            series={[
              { key: "paymentRequests", label: "Payment requests" },
              { key: "completedPayments", label: "Completed payments" }
            ]}
          />
        </AdminSection>
      </div>
    );
  }

  if (section === "users") {
    const users = data.users.filter((user) =>
      includesQuery([user.name, user.email, user.role, user.organization, user.status], query)
    );
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="User management"
          description="Managers, tenants, and the reserved system admin identity with linked record counts and account state."
          actions={<SearchField action="/admin/users" range={data.range} query={query} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="All users" value={data.users.length} detail={`${data.overview.admins} admin`} tone="brand" />
          <AdminMetricCard label="Managers" value={data.overview.managers} detail={`${data.overview.activeManagers} active`} />
          <AdminMetricCard label="Tenants" value={data.overview.tenants} detail={`${data.overview.activeTenants} active`} />
          <AdminMetricCard label="New this week" value={data.overview.newUsersThisWeek} detail="Last 7 days" tone="blue" />
          <AdminMetricCard label="New this month" value={data.overview.newUsersThisMonth} detail="Current calendar month" />
        </AdminStatGrid>
        <AdminSection title="Platform accounts" description="Every account is server-authorized before this data is rendered.">
          <AdminDataTable columns={["User", "Role", "Status", "Organization", "Linked records", "Last login", "Created", "Actions"]} minWidth="68rem">
            {users.map((user) => (
              <tr key={user.id} className="table-row">
                <td className="table-cell">
                  <Link href={`/admin/users/${user.id}`} className="font-semibold hover:text-[var(--brand)]">{user.name}</Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{user.email}</p>
                </td>
                <td className="table-cell"><AdminStatusBadge status={user.role} /></td>
                <td className="table-cell"><AdminStatusBadge status={user.status} /></td>
                <td className="table-cell text-[var(--muted)]">{user.organization}</td>
                <td className="table-cell text-[var(--muted)]">{user.propertyCount} properties / {user.leaseCount} leases / {user.paymentCount} payments</td>
                <td className="table-cell text-[var(--muted)]">{formatDateTime(user.lastLoginAt)}</td>
                <td className="table-cell text-[var(--muted)]">{formatAppDate(user.createdAt)}</td>
                <td className="table-cell">
                  <Link href={`/admin/users/${user.id}`} className="text-xs font-semibold text-[var(--brand)]">View account</Link>
                </td>
              </tr>
            ))}
          </AdminDataTable>
          {!users.length ? <EmptyState title="No matching users" description="Change the search term to view platform accounts." /> : null}
        </AdminSection>
      </div>
    );
  }

  if (section === "managers") {
    const managers = data.managers.filter((manager) =>
      includesQuery([manager.name, manager.email, manager.organization, manager.stripeStatus], query)
    );
    const neverAddedProperty = data.managers.filter((item) => item.propertyCount === 0).length;
    const noLease = data.managers.filter((item) => item.propertyCount > 0 && item.leaseCount === 0).length;
    const noPayment = data.managers.filter((item) => item.leaseCount > 0 && item.paymentCount === 0).length;
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Manager accounts"
          description="Portfolio scale, rent and payment volume, setup completion, Stripe readiness, and onboarding drop-offs."
          actions={<SearchField action="/admin/managers" range={data.range} query={query} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="Managers" value={data.managers.length} detail={`${data.overview.activeManagers} active`} tone="brand" />
          <AdminMetricCard label="Never added property" value={neverAddedProperty} detail="Account onboarding drop-off" tone={neverAddedProperty ? "warning" : "success"} />
          <AdminMetricCard label="Property, no lease" value={noLease} detail="Leasing workflow drop-off" tone={noLease ? "warning" : "success"} />
          <AdminMetricCard label="Lease, no charge" value={noPayment} detail="Collections workflow drop-off" tone={noPayment ? "warning" : "success"} />
          <AdminMetricCard label="Stripe ready" value={data.stripe.fullyOnboarded} detail={`${data.stripe.connected} connected accounts`} tone="success" />
          <AdminMetricCard label="No login recorded" value={data.managers.filter((item) => !item.lastLoginAt).length} detail="Includes pre-tracking accounts" tone="warning" />
        </AdminStatGrid>
        <AdminSection title="Manager performance and setup" description="Ranked by collected payment volume, then scheduled rent roll.">
          <AdminDataTable columns={["Manager", "Portfolio", "Residents", "Activity", "Rent roll", "Collected", "Open balance", "Setup", "Stripe", "Last login"]} minWidth="78rem">
            {managers.map((manager) => (
              <tr key={manager.id} className="table-row">
                <td className="table-cell">
                  <Link href={`/admin/managers/${manager.id}`} className="font-semibold hover:text-[var(--brand)]">{manager.name}</Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{manager.email}</p>
                </td>
                <td className="table-cell text-[var(--muted)]">{manager.propertyCount} properties / {manager.unitCount} units / {manager.leaseCount} leases</td>
                <td className="table-cell text-[var(--muted)]">{manager.tenantCount}</td>
                <td className="table-cell text-[var(--muted)]">{manager.activityCount} events</td>
                <td className="table-cell font-semibold">{formatCurrency(manager.rentVolume)}</td>
                <td className="table-cell font-semibold">{formatCurrency(manager.paymentVolume)}</td>
                <td className="table-cell font-semibold">{formatCurrency(manager.openBalance)}</td>
                <td className="table-cell">{manager.setupProgress}%</td>
                <td className="table-cell"><AdminStatusBadge status={manager.stripeStatus} /></td>
                <td className="table-cell text-[var(--muted)]">{formatDateTime(manager.lastLoginAt)}</td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  if (section === "tenants") {
    const tenants = data.tenants.filter((tenant) =>
      includesQuery([tenant.name, tenant.email, tenant.organization, tenant.portalStatus, tenant.inviteStatus], query)
    );
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Tenant accounts"
          description="Resident portal activation, invite state, lease connections, unpaid charges, and recent access."
          actions={<SearchField action="/admin/tenants" range={data.range} query={query} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="Tenant records" value={data.tenants.length} detail={`${data.overview.tenants} portal accounts`} tone="brand" />
          <AdminMetricCard label="No portal account" value={data.tenants.filter((item) => item.portalStatus === "no account").length} detail="Resident records without login access" tone="warning" />
          <AdminMetricCard label="Unpaid tenants" value={data.tenants.filter((item) => item.openBalance > 0).length} detail="Residents with open charges" tone="warning" />
          <AdminMetricCard label="Tenant activation" value={`${data.growth.tenantActivationRate}%`} detail="Account connected to lease" tone="success" />
        </AdminStatGrid>
        <AdminSection title="Resident directory" description="Tenant records sorted by open balance.">
          <AdminDataTable columns={["Tenant", "Organization", "Portal", "Invite", "Leases", "Payments", "Open balance", "Last login"]} minWidth="64rem">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="table-row">
                <td className="table-cell">
                  <p className="font-semibold">{tenant.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{tenant.email}</p>
                </td>
                <td className="table-cell text-[var(--muted)]">{tenant.organization}</td>
                <td className="table-cell"><AdminStatusBadge status={tenant.portalStatus} /></td>
                <td className="table-cell"><AdminStatusBadge status={tenant.inviteStatus} /></td>
                <td className="table-cell">{tenant.leaseCount}</td>
                <td className="table-cell">{tenant.paymentCount}</td>
                <td className="table-cell font-semibold">{formatCurrency(tenant.openBalance)}</td>
                <td className="table-cell text-[var(--muted)]">{formatDateTime(tenant.lastLoginAt)}</td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  if (section === "properties") {
    const properties = data.properties.filter((property) =>
      includesQuery([property.name, property.address, property.organization, property.manager, property.status], query)
    );
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Platform properties"
          description="All managed assets, manager ownership, unit density, occupancy, rent roll, and collections exposure."
          actions={<SearchField action="/admin/properties" range={data.range} query={query} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="Properties" value={data.properties.length} detail={`${data.overview.newProperties} added ${data.rangeLabel.toLowerCase()}`} tone="brand" />
          <AdminMetricCard label="Units" value={data.overview.units} detail={`${data.overview.activeLeases} active leases`} />
          <AdminMetricCard label="Properties without units" value={data.properties.filter((item) => item.units === 0).length} detail="Incomplete property setup" tone="warning" />
          <AdminMetricCard label="Platform rent roll" value={formatCurrency(data.properties.reduce((sum, item) => sum + item.rentRoll, 0))} detail="Scheduled monthly unit rent" tone="success" />
          <AdminMetricCard label="Overdue exposure" value={formatCurrency(data.properties.reduce((sum, item) => sum + item.overdueBalance, 0))} detail="Past-due property balances" tone="warning" />
        </AdminStatGrid>
        <AdminSection title="Property performance" description="Properties sorted by overdue balance and rent roll.">
          <AdminDataTable columns={["Property", "Manager", "Units", "Occupancy", "Active leases", "Rent roll", "Open", "Overdue", "Status"]} minWidth="72rem">
            {properties.map((property) => (
              <tr key={property.id} className="table-row">
                <td className="table-cell">
                  <p className="font-semibold">{property.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{property.address}</p>
                </td>
                <td className="table-cell">
                  {property.managerId ? <Link href={`/admin/managers/${property.managerId}`} className="font-medium hover:text-[var(--brand)]">{property.manager}</Link> : <AdminStatusBadge status="Unassigned" />}
                </td>
                <td className="table-cell">{property.units}</td>
                <td className="table-cell">{property.units ? `${Math.round((property.occupiedUnits / property.units) * 100)}%` : "No units"}</td>
                <td className="table-cell">{property.activeLeases}</td>
                <td className="table-cell font-semibold">{formatCurrency(property.rentRoll)}</td>
                <td className="table-cell font-semibold">{formatCurrency(property.openBalance)}</td>
                <td className="table-cell font-semibold text-[var(--danger)]">{formatCurrency(property.overdueBalance)}</td>
                <td className="table-cell"><AdminStatusBadge status={property.status} /></td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  if (section === "payments") {
    const payments = data.payments.rows.filter((payment) =>
      includesQuery([payment.description, payment.property, payment.unit, payment.tenant, payment.lease, payment.status, payment.source], query)
    );
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Payments administration"
          description="Read-only platform payment diagnostics, Stripe linkage, collected volume, open balances, and integrity warnings."
          actions={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SearchField action="/admin/payments" range={data.range} query={query} />
              <AdminFilterBar action="/admin/payments" range={data.range}>
                {query ? <input type="hidden" name="q" value={query} /> : null}
              </AdminFilterBar>
            </div>
          }
        />
        <AdminStatGrid>
          <AdminMetricCard label="Payment requests" value={data.payments.metrics.requests} detail={data.rangeLabel} tone="brand" />
          <AdminMetricCard label="Paid payments" value={data.payments.metrics.paid} detail={data.rangeLabel} tone="success" />
          <AdminMetricCard label="Unpaid payments" value={data.payments.metrics.unpaid} detail="Current open records" tone="warning" />
          <AdminMetricCard label="Overdue balance" value={formatCurrency(data.payments.metrics.overdueBalance)} detail="Current platform exposure" tone="danger" />
          <AdminMetricCard label="Collected volume" value={formatCurrency(data.payments.metrics.collectedVolume)} detail={data.rangeLabel} tone="success" />
          <AdminMetricCard label="Manual payments" value={data.payments.metrics.manualPayments} detail={data.rangeLabel} />
          <AdminMetricCard label="Stripe payments" value={data.payments.metrics.stripePayments} detail={data.rangeLabel} tone="brand" />
          <UnavailableMetric label="Failed payments" detail="Declined checkout telemetry is not persisted yet." />
          <UnavailableMetric label="Refunded payments" detail="Refund records are not supported by the current ledger." />
          <AdminMetricCard label="Missing sessions" value={data.payments.metrics.missingStripeSession} detail="Stripe-linked records without session ID" tone="warning" />
          <AdminMetricCard label="Paid, no date" value={data.payments.metrics.paidMissingDate} detail="Integrity warning" tone="warning" />
          <AdminMetricCard label="Amount mismatch" value={data.payments.metrics.amountMismatches} detail="Stripe amount differs from ledger" tone="danger" />
        </AdminStatGrid>
        <AdminSection
          title="Payment records"
          description="Diagnostic-first controls. No admin action on this page can move money."
          actions={<a href="/api/admin/export/payments" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)]"><Download className="h-4 w-4" /> Export CSV</a>}
        >
          <AdminDataTable columns={["Payment", "Location", "Tenant / lease", "Status", "Amount", "Balance", "Source", "Due / paid", "Diagnostics"]} minWidth="82rem">
            {payments.map((payment) => (
              <tr key={payment.id} className="table-row">
                <td className="table-cell">
                  <p className="font-semibold">{payment.description}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">{payment.id}</p>
                </td>
                <td className="table-cell text-[var(--muted)]">{payment.property} / {payment.unit}</td>
                <td className="table-cell">
                  <p className="font-medium">{payment.tenant}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{payment.lease}</p>
                </td>
                <td className="table-cell"><AdminStatusBadge status={payment.status} /></td>
                <td className="table-cell font-semibold">{formatCurrency(payment.amount)}</td>
                <td className="table-cell font-semibold">{formatCurrency(payment.balanceDue)}</td>
                <td className="table-cell"><AdminStatusBadge status={payment.source} /></td>
                <td className="table-cell text-[var(--muted)]">
                  <p>Due {formatAppDate(payment.dueDate)}</p>
                  <p className="mt-0.5">Paid {payment.paidDate ? formatAppDate(payment.paidDate) : "Not paid"}</p>
                </td>
                <td className="table-cell">
                  {payment.warnings.length ? (
                    <div className="flex max-w-52 flex-wrap gap-1">
                      {payment.warnings.map((warning) => <AdminStatusBadge key={warning} status={warning} />)}
                    </div>
                  ) : <AdminStatusBadge status="Healthy" />}
                </td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  if (section === "applications") {
    const applications = data.applications.rows.filter((item) =>
      includesQuery([item.applicant, item.email, item.application, item.property, item.unit, item.manager, item.status], query)
    );
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Applications administration"
          description="Published application links, applicant submissions, review status, fee state, and move-in conversion."
          actions={<SearchField action="/admin/applications" range={data.range} query={query} />}
        />
        <AdminStatGrid>
          <AdminMetricCard label="Application links" value={data.applications.links} detail="Created across platform" tone="brand" />
          <AdminMetricCard label="Submitted" value={data.applications.submitted} detail={data.rangeLabel} tone="blue" />
          <AdminMetricCard label="Approved, not converted" value={data.applications.approved} detail="Ready for move-in conversion" tone="warning" />
          <AdminMetricCard label="Converted" value={data.applications.converted} detail="Submissions converted to lease" tone="success" />
        </AdminStatGrid>
        <AdminSection title="Applicant pipeline" description="Most recent submissions first.">
          <AdminDataTable columns={["Applicant", "Application", "Property / unit", "Manager", "Status", "Fee", "Submitted"]} minWidth="64rem">
            {applications.map((item) => (
              <tr key={item.id} className="table-row">
                <td className="table-cell">
                  <p className="font-semibold">{item.applicant}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{item.email}</p>
                </td>
                <td className="table-cell font-medium">{item.application}</td>
                <td className="table-cell text-[var(--muted)]">{item.property} / {item.unit}</td>
                <td className="table-cell text-[var(--muted)]">{item.manager}</td>
                <td className="table-cell"><AdminStatusBadge status={item.status} /></td>
                <td className="table-cell"><AdminStatusBadge status={item.feeStatus} /></td>
                <td className="table-cell text-[var(--muted)]">{formatDateTime(item.submittedAt)}</td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  if (section === "stripe") {
    const refreshStatus = typeof params.refresh === "string" ? params.refresh : null;
    const refreshMessage = typeof params.message === "string" ? params.message : null;
    const resetStatus = typeof params.reset === "string" ? params.reset : null;
    const resetManagerEmail = typeof params.resetManager === "string" ? params.resetManager : null;
    const repairStatus = typeof params.repair === "string" ? params.repair : null;
    const repairReason = typeof params.reason === "string" ? params.reason : null;
    const repairManagerId = typeof params.manager === "string" ? params.manager : null;
    const repairAccountId = typeof params.account === "string" ? params.account : null;
    const repairStoredUser = typeof params.storedUser === "string" ? params.storedUser : null;
    const repairMetadataUser = typeof params.metadataUser === "string" ? params.metadataUser : null;
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Stripe administration"
          description="Connected account readiness, payout capability, webhook visibility, and safe status refresh tools."
          actions={<AdminFilterBar action="/admin/stripe" range={data.range} />}
        />
        {refreshStatus ? (
          <div className={refreshStatus === "success" ? "border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" : "border border-red-200 bg-red-50 p-3 text-sm text-red-800"}>
            {refreshStatus === "success" ? "Manager Stripe status refreshed." : refreshMessage ?? "Stripe status could not be refreshed."}
          </div>
        ) : null}
        {resetStatus ? (
          <div className={resetStatus === "success" ? "border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" : "border border-red-200 bg-red-50 p-3 text-sm text-red-800"}>
            {resetStatus === "success"
              ? `Stripe Connect cleared for ${resetManagerEmail}. The manager can now reconnect from Settings.`
              : "Could not reset Stripe Connect. Manager not found or account type is invalid."}
          </div>
        ) : null}
        {repairStatus === "success" ? (
          <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Connected account {repairAccountId} was verified and attached to manager {repairManagerId}. The override was
            recorded as a sensitive admin event.
          </div>
        ) : null}
        {repairStatus === "confirm" ? (
          <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">Confirm Stripe account reassignment</p>
            <p className="mt-1">
              Account <span className="font-mono">{repairAccountId}</span> belongs to this manager&apos;s organization, but its
              metadata userId is <span className="font-mono">{repairMetadataUser}</span> while you are attaching it to user{" "}
              <span className="font-mono">{repairStoredUser}</span>. Re-submit the repair form below with the confirmation
              checkbox checked to proceed.
            </p>
          </div>
        ) : null}
        {repairStatus && repairStatus !== "success" && repairStatus !== "confirm" ? (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {repairStatus === "blocked"
              ? `Repair refused: ${repairReason ?? "ownership mismatch"}. Cross-organization accounts can never be attached.`
              : repairStatus === "invalid-id"
                ? "Enter a Stripe account ID starting with acct_."
                : repairStatus === "manager-missing"
                  ? "Manager not found or the user is a tenant."
                  : "Stripe repair failed. Check the account ID and try again."}
          </div>
        ) : null}
        <AdminStatGrid>
          <AdminMetricCard label="Connected accounts" value={data.stripe.connected} detail={`${data.overview.managers} manager accounts`} tone="brand" />
          <AdminMetricCard label="Fully onboarded" value={data.stripe.fullyOnboarded} detail="Charges and payouts enabled" tone="success" />
          <AdminMetricCard label="Pending review" value={data.stripe.pendingReview} detail="Submitted to Stripe" tone="warning" />
          <AdminMetricCard label="Missing payouts" value={data.stripe.missingPayouts} detail="Connected but payouts disabled" tone="warning" />
          <AdminMetricCard label="Disabled reason" value={data.stripe.disabled} detail="Accounts with Stripe restriction" tone="danger" />
          <AdminMetricCard label="Webhook failures" value={data.stripe.failedWebhookEvents} detail={data.rangeLabel} tone={data.stripe.failedWebhookEvents ? "danger" : "success"} />
          <AdminMetricCard label="Unmatched events" value={data.stripe.unmatchedEvents} detail="Verified but ignored webhook types" />
          <AdminMetricCard label="Last webhook" value={data.stripe.lastWebhookAt ? formatAppDate(data.stripe.lastWebhookAt) : "Not recorded"} detail={formatDateTime(data.stripe.lastWebhookAt)} />
        </AdminStatGrid>
        <AdminSection title="Manager connected accounts" description="Refresh reads status from Stripe; it cannot initiate charges, transfers, payouts, or refunds.">
          <AdminDataTable columns={["Manager", "Account", "Status", "Ownership", "Charges", "Payouts", "Details", "Disabled reason", "Last refresh", "Action"]} minWidth="86rem">
            {data.stripe.rows.map((row) => (
              <tr key={row.id} className="table-row">
                <td className="table-cell">
                  <Link href={`/admin/managers/${row.id}`} className="font-semibold hover:text-[var(--brand)]">{row.manager}</Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{row.email}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">{row.id}</p>
                </td>
                <td className="table-cell font-mono text-xs text-[var(--muted)]">{row.accountId ?? "Not created"}</td>
                <td className="table-cell"><AdminStatusBadge status={row.status} /></td>
                <td className="table-cell">
                  {!row.accountId ? (
                    <span className="text-xs text-[var(--muted)]">No account</span>
                  ) : row.metadataMismatch ? (
                    <>
                      <AdminStatusBadge status="Mismatch" />
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">
                        meta user: {row.metadataUserId ?? "missing"}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--muted)]">
                        meta org: {row.metadataOrganizationId ?? "missing"}
                      </p>
                    </>
                  ) : row.metadataUserId ? (
                    <AdminStatusBadge status="Verified" />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Not synced</span>
                  )}
                </td>
                <td className="table-cell"><AdminStatusBadge status={row.chargesEnabled ? "Enabled" : "Missing"} /></td>
                <td className="table-cell"><AdminStatusBadge status={row.payoutsEnabled ? "Enabled" : "Missing"} /></td>
                <td className="table-cell"><AdminStatusBadge status={row.detailsSubmitted ? "Submitted" : "Incomplete"} /></td>
                <td className="table-cell text-[var(--muted)]">{row.disabledReason ?? "None"}</td>
                <td className="table-cell text-[var(--muted)]">{formatDateTime(row.updatedAt)}</td>
                <td className="table-cell">
                  {row.accountId ? (
                    <div className="flex flex-col gap-1.5">
                      <form action={refreshManagerStripeAction}>
                        <input type="hidden" name="managerId" value={row.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)]">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Refresh
                        </button>
                      </form>
                      <form action={resetManagerStripeConnectAction}>
                        <input type="hidden" name="managerId" value={row.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-800">
                          <XCircle className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      </form>
                    </div>
                  ) : <span className="text-xs text-[var(--muted)]">No account</span>}
                </td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
        <AdminSection
          title="Repair connected account (system admin override)"
          description="Reassign a connected account whose Stripe metadata maps to the manager's organization but a different Nexus user. The account is always retrieved from Stripe and verified first; cross-organization accounts are always refused, and the override is logged as a sensitive admin event."
        >
          <form action={adminRepairStripeAccountAction} className="grid max-w-xl gap-3">
            <div>
              <label className="field-label" htmlFor="repair-manager-id">Manager user ID</label>
              <input
                id="repair-manager-id"
                name="managerId"
                required
                defaultValue={repairManagerId ?? ""}
                placeholder="user_..."
                className="field font-mono text-xs"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="repair-account-id">Stripe account ID</label>
              <input
                id="repair-account-id"
                name="accountId"
                required
                pattern="acct_[A-Za-z0-9]+"
                defaultValue={repairAccountId ?? ""}
                placeholder="acct_..."
                className="field font-mono text-xs"
              />
            </div>
            <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
              <input type="checkbox" name="confirmRepair" className="mt-0.5 shrink-0" />
              <span>I understand this changes payout routing for this organization.</span>
            </label>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Submitting without the confirmation runs a verification preview that shows the stored userId next to the
              Stripe metadata userId before anything changes.
            </p>
            <button type="submit" className="button-compact w-fit border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold hover:bg-[var(--surface-hover)]">
              <ShieldAlert className="h-4 w-4" />
              Verify and repair
            </button>
          </form>
        </AdminSection>
        <AdminSection title="Recent verified webhook events" description="Only verified Stripe events are stored. Secret signatures and payload contents are never retained.">
          {data.stripe.recentEvents.length ? (
            <AdminDataTable columns={["Time", "Event type", "Status", "Message", "Event ID"]} minWidth="52rem">
              {data.stripe.recentEvents.map((event) => (
                <tr key={event.id} className="table-row">
                  <td className="table-cell text-[var(--muted)]">{formatDateTime(event.createdAt)}</td>
                  <td className="table-cell font-medium">{event.category}</td>
                  <td className="table-cell"><AdminStatusBadge status={event.status} /></td>
                  <td className="table-cell text-[var(--muted)]">{event.message ?? "No message"}</td>
                  <td className="table-cell font-mono text-xs text-[var(--muted)]">{String(event.metadata?.eventId ?? event.relatedId ?? "Not recorded")}</td>
                </tr>
              ))}
            </AdminDataTable>
          ) : <EmptyState title="No stored Stripe events" description="Webhook telemetry begins recording after this admin expansion is deployed." />}
        </AdminSection>
      </div>
    );
  }

  if (section === "email") {
    const testStatus = typeof params.test === "string" ? params.test : null;
    const testMessage = typeof params.message === "string" ? params.message : null;
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Email and notification administration"
          description="Cloudflare transport health, APP_URL safety, delivery events, invite outcomes, and password reset activity."
          actions={
            <form action={sendAdminTestEmailAction}>
              <button type="submit" className="inline-flex min-h-10 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white">
                <MailCheck className="h-4 w-4" />
                Send test email
              </button>
            </form>
          }
        />
        {testStatus ? (
          <div className={testStatus === "sent" ? "border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" : "border border-red-200 bg-red-50 p-3 text-sm text-red-800"}>
            {testStatus === "sent" ? "Cloudflare accepted the admin test email." : testMessage ?? "The test email failed."}
          </div>
        ) : null}
        <AdminStatGrid>
          <AdminMetricCard label="Emails sent" value={data.email.totalSent} detail={data.rangeLabel} tone="success" />
          <AdminMetricCard label="Password reset emails" value={data.email.passwordResetEmails} detail={data.rangeLabel} />
          <AdminMetricCard label="Tenant invites" value={data.email.tenantInviteEmails} detail={data.rangeLabel} tone="brand" />
          <AdminMetricCard label="Move-in invites" value={data.email.moveInInviteEmails} detail={data.rangeLabel} tone="blue" />
          <AdminMetricCard label="Failed sends" value={data.email.failed} detail={data.rangeLabel} tone={data.email.failed ? "danger" : "success"} />
          <AdminMetricCard label="Invalid-host blocks" value={data.email.blocked} detail="Unsafe email links prevented" tone={data.email.blocked ? "danger" : "success"} />
          <AdminMetricCard label="Invite delivery" value={data.email.inviteDelivered} detail={`${data.email.inviteFailed} failed`} tone="success" />
          <AdminMetricCard label="Reset requests" value={data.email.passwordResetRequests} detail={data.rangeLabel} />
        </AdminStatGrid>
        <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-2 xl:grid-cols-4">
          <AdminHealthCard
            label="Cloudflare Worker"
            healthy={Boolean(emailProbe?.ok)}
            detail={emailProbe ? (emailProbe.ok ? `Health endpoint returned ${emailProbe.status}.` : emailProbe.error ?? `Worker returned ${emailProbe.status}.`) : "Worker probe unavailable."}
            value={data.email.diagnostics.worker.urlHost ?? undefined}
          />
          <AdminHealthCard
            label="Sender"
            healthy={data.email.diagnostics.sender.present && !data.email.diagnostics.sender.usesDefault}
            detail="Only the safe sender domain is displayed."
            value={data.email.diagnostics.sender.emailDomain ?? "Missing"}
          />
          <AdminHealthCard
            label="APP_URL"
            healthy={data.email.diagnostics.appUrl.valid}
            detail="Reset and invite links must match this canonical host."
            value={data.email.diagnostics.appUrl.host ?? "Missing"}
          />
          <AdminHealthCard
            label="Email transport"
            healthy={data.email.diagnostics.configured}
            detail={data.email.diagnostics.issues[0] ?? "Worker or REST transport is configured."}
            value={data.email.diagnostics.transport}
          />
        </section>
        {data.email.lastError ? (
          <div className="border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Last email error</p>
            <p className="mt-1 text-xs leading-5 text-red-700">{data.email.lastError}</p>
          </div>
        ) : null}
        <AdminSection title="Recent email events" description="Delivery metadata only. Raw tokens, links, message bodies, and secrets are not stored.">
          {data.email.events.length ? (
            <AdminDataTable columns={["Time", "Category", "Event", "Status", "Recipient", "Reason"]} minWidth="60rem">
              {data.email.events.map((event) => (
                <tr key={event.id} className="table-row">
                  <td className="table-cell text-[var(--muted)]">{formatDateTime(event.createdAt)}</td>
                  <td className="table-cell font-medium">{event.category.replaceAll("_", " ")}</td>
                  <td className="table-cell">{event.type}</td>
                  <td className="table-cell"><AdminStatusBadge status={event.status} /></td>
                  <td className="table-cell text-[var(--muted)]">{String(event.metadata?.recipient ?? "Not recorded")}</td>
                  <td className="table-cell text-[var(--muted)]">{event.message ?? "No detail"}</td>
                </tr>
              ))}
            </AdminDataTable>
          ) : <EmptyState title="No stored email events" description="Delivery telemetry begins recording after this admin expansion is deployed." />}
        </AdminSection>
      </div>
    );
  }

  if (section === "operations") {
    const severity = typeof params.severity === "string" ? params.severity : "all";
    const issues = data.operations.issues.filter((issue) => severity === "all" || issue.severity === severity);
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Data integrity and operations center"
          description="Read-only detection of broken relationships, incomplete onboarding, invalid payment records, duplicate identities, and workflow gaps."
          actions={
            <form action="/admin/operations" className="flex items-center gap-2">
              <select name="severity" defaultValue={severity} className="field select-compact min-w-36 text-sm">
                <option value="all">All severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <button type="submit" className="button-compact border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold">Apply</button>
            </form>
          }
        />
        <AdminStatGrid>
          <AdminMetricCard label="All findings" value={data.operations.issues.length} detail="Current platform scan" tone="brand" />
          <AdminMetricCard label="Critical" value={data.operations.critical} detail="Broken or invalid records" tone="danger" />
          <AdminMetricCard label="Warnings" value={data.operations.warnings} detail="Incomplete or inconsistent records" tone="warning" />
          <AdminMetricCard label="Info" value={data.operations.info} detail="Onboarding and workflow gaps" tone="blue" />
        </AdminStatGrid>
        <AdminSection
          title="Integrity findings"
          description="Review tools are intentionally non-destructive. Automated repair remains disabled until record-specific repair workflows are designed."
          actions={<button disabled className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Bulk repair coming later</button>}
        >
          {issues.length ? (
            <AdminDataTable columns={["Severity", "Finding", "Entity", "Record ID", "Review"]} minWidth="58rem">
              {issues.map((issue) => (
                <tr key={issue.id} className="table-row">
                  <td className="table-cell"><AdminStatusBadge status={issue.severity} /></td>
                  <td className="table-cell">
                    <p className="font-semibold">{issue.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{issue.detail}</p>
                  </td>
                  <td className="table-cell text-[var(--muted)]">{issue.entityType}</td>
                  <td className="table-cell">
                    <p className="max-w-52 truncate font-mono text-xs text-[var(--muted)]">{issue.entityId}</p>
                    <CopyRecordIdButton value={issue.entityId} />
                  </td>
                  <td className="table-cell">
                    {issue.href ? <Link href={issue.href} className="text-xs font-semibold text-[var(--brand)]">View affected records</Link> : <span className="text-xs text-[var(--muted)]">Manual review</span>}
                  </td>
                </tr>
              ))}
            </AdminDataTable>
          ) : <EmptyState title="No findings in this severity" description="The current platform data passes the selected checks." />}
        </AdminSection>
      </div>
    );
  }

  if (section === "product-analytics") {
    const maxFeature = Math.max(...data.product.features.map((item) => item.count), 1);
    return (
      <div className="space-y-5">
        <AdminPageHeader
          title="Product analytics"
          description="Feature adoption, manager and tenant activation funnels, workflow drop-offs, and module usage based on stored platform records."
          actions={<AdminFilterBar action="/admin/product-analytics" range={data.range} />}
        />
        <section className="ops-split">
          <AdminSection title="Feature adoption" description="All-time stored record counts by product workflow.">
            <div className="divide-y divide-[var(--line)]">
              {data.product.features.map((feature) => (
                <div key={feature.key} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{feature.label}</span>
                    <span className="text-sm font-semibold tabular-nums">{feature.count}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-[var(--surface)]">
                    <div className="h-full bg-[var(--brand)]" style={{ width: `${Math.max(2, (feature.count / maxFeature) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </AdminSection>
          <AdminSection title="Most and least used modules" description="Usage proxy based on records created in each module.">
            <AdminDataTable columns={["Rank", "Module", "Stored activity"]} minWidth="28rem">
              {data.product.features.map((feature, index) => (
                <tr key={feature.key} className="table-row">
                  <td className="table-cell text-[var(--muted)]">{index + 1}</td>
                  <td className="table-cell font-semibold">{feature.label}</td>
                  <td className="table-cell">{feature.count}</td>
                </tr>
              ))}
            </AdminDataTable>
          </AdminSection>
        </section>
        <section className="ops-split">
          <Funnel title="Manager activation funnel" rows={data.product.managerFunnel} />
          <Funnel title="Tenant activation funnel" rows={data.product.tenantFunnel} />
        </section>
        <AdminSection title="Retention indicators" description="Last-login cohorts and recurring usage need dedicated product telemetry. The current indicators use account access and persisted workflow records.">
          <AdminStatGrid>
            <AdminMetricCard label="Managers logged in" value={data.managers.filter((item) => item.lastLoginAt).length} detail="At least one tracked login" tone="brand" />
            <AdminMetricCard label="Tenants logged in" value={data.tenants.filter((item) => item.lastLoginAt).length} detail="At least one tracked login" tone="blue" />
            <AdminMetricCard label="Managers complete" value={data.managers.filter((item) => item.setupComplete).length} detail="Full operating checklist" tone="success" />
            <UnavailableMetric label="Cohort retention" detail="Requires recurring session or analytics events beyond last login." />
          </AdminStatGrid>
        </AdminSection>
      </div>
    );
  }

  if (section === "reports") {
    const exports = [
      ["Users CSV", "users"],
      ["Managers CSV", "managers"],
      ["Properties CSV", "properties"],
      ["Units CSV", "units"],
      ["Leases CSV", "leases"],
      ["Payments CSV", "payments"],
      ["Applications CSV", "applications"],
      ["Platform summary CSV", "summary"]
    ];
    return (
      <div className="space-y-5">
        <AdminPageHeader title="Reports and exports" description="Admin-only CSV exports for platform analysis, auditing, and offline review." />
        <AdminStatGrid>
          <AdminMetricCard label="Users" value={data.users.length} detail="Exportable accounts" />
          <AdminMetricCard label="Properties" value={data.properties.length} detail="Exportable assets" />
          <AdminMetricCard label="Payments" value={data.payments.rows.length} detail="Exportable ledger records" />
          <AdminMetricCard label="Applications" value={data.applications.rows.length} detail="Exportable submissions" />
        </AdminStatGrid>
        <AdminSection title="Available exports" description="CSV cells are escaped and spreadsheet formulas are neutralized.">
          <div className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
            {exports.map(([label, dataset]) => (
              <a key={dataset} href={`/api/admin/export/${dataset}`} className="group bg-white p-4 hover:bg-[var(--surface)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{label}</p>
                  <Download className="h-4 w-4 text-[var(--muted)] group-hover:text-[var(--brand)]" />
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">Download current platform data</p>
              </a>
            ))}
          </div>
        </AdminSection>
      </div>
    );
  }

  if (section === "system-health") {
    return (
      <div className="space-y-5">
        <AdminPageHeader title="System health" description="Safe configuration, connectivity, transport, storage, and runtime checks without exposing secrets." />
        <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-2 xl:grid-cols-3">
          <AdminHealthCard label="Database" healthy={data.system.databaseConnected && data.system.databaseConfigured} detail="The admin snapshot was read successfully from the hosted store. Hostname only; credentials are never displayed." value={data.system.databaseConfigured ? data.system.databaseTarget : "DATABASE_URL missing"} />
          <AdminHealthCard label="Email Worker" healthy={Boolean(emailProbe?.ok)} detail={emailProbe?.ok ? `Health endpoint returned ${emailProbe.status}.` : emailProbe?.error ?? "No successful worker probe."} value={data.email.diagnostics.worker.urlHost ?? "Worker host missing"} />
          <AdminHealthCard label="Stripe API" healthy={data.system.stripeApiConfigured} detail="Mode is derived from the key prefix. Secret values are never displayed." value={data.system.stripeApiConfigured ? `STRIPE_SECRET_KEY present — ${data.system.stripeMode} mode` : "STRIPE_SECRET_KEY missing"} />
          <AdminHealthCard label="Stripe webhook" healthy={data.system.stripeWebhookConfigured} detail={data.stripe.lastWebhookAt ? `Last verified event ${formatDateTime(data.stripe.lastWebhookAt)}.` : "Configured state and stored event history."} value={data.system.stripeWebhookConfigured ? "STRIPE_WEBHOOK_SECRET present" : "STRIPE_WEBHOOK_SECRET missing"} />
          <AdminHealthCard label="APP_URL" healthy={data.system.appUrl.valid} detail={data.system.appUrl.issue ?? "Canonical public application origin is valid."} value={data.system.appUrl.host ?? "Missing"} />
          <AdminHealthCard label="Authentication secret" healthy={data.system.authSecretConfigured} detail="Presence check only." value={data.system.authSecretConfigured ? "AUTH_SECRET present" : "AUTH_SECRET missing"} />
          <AdminHealthCard label="File storage" healthy={data.system.blobConfigured || data.system.environment !== "production"} detail={data.system.blobConfigured ? "Persistent blob storage is configured." : "Local storage is acceptable only outside production."} value={data.system.blobConfigured ? "BLOB_READ_WRITE_TOKEN present" : "BLOB_READ_WRITE_TOKEN missing"} />
          <AdminHealthCard label="Runtime environment" healthy={true} detail="Current application runtime mode (NODE_ENV / VERCEL_ENV classification)." value={`${data.system.environment} (${data.system.runtimeEnvironment})`} />
          <AdminHealthCard label="Application version" healthy={true} detail="Version from package metadata. Build SHA is not configured." value={data.system.version} />
        </section>
        <AdminSection title="Operational metadata" description="Current snapshot timestamps and safe hostnames.">
          <AdminDataTable columns={["Item", "Value", "Status"]} minWidth="36rem">
            {[
              ["Last data update", formatDateTime(data.system.lastDataUpdate), "Available"],
              ["Admin snapshot generated", formatDateTime(data.generatedAt), "Available"],
              ["APP_URL host", data.system.appUrl.host ?? "Missing", data.system.appUrl.valid ? "Valid" : "Invalid"],
              ["Email Worker host", data.email.diagnostics.worker.urlHost ?? "Missing", emailProbe?.ok ? "Healthy" : "Needs attention"],
              ["Last verified Stripe webhook", formatDateTime(data.stripe.lastWebhookAt), data.stripe.lastWebhookAt ? "Available" : "Not recorded"],
              ["Last successful build", "Not tracked", "Telemetry unavailable"]
            ].map(([label, value, status]) => (
              <tr key={label} className="table-row">
                <td className="table-cell font-semibold">{label}</td>
                <td className="table-cell font-mono text-xs text-[var(--muted)]">{value}</td>
                <td className="table-cell"><AdminStatusBadge status={status} /></td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Admin settings"
        description="System administration boundaries, safe tooling, and future platform control placeholders."
      />
      <section className="ops-split">
        <AdminSection title="Security boundary" description="Admin pages and actions require the reserved system admin identity on the server.">
          <div className="space-y-3">
            <SettingRow label="Admin route authorization" value="Server-side enforced" status="Healthy" />
            <SettingRow label="Manager and tenant access" value="Denied by middleware and page checks" status="Healthy" />
            <SettingRow label="Raw tokens and secrets" value="Never displayed in admin UI" status="Healthy" />
            <SettingRow label="Money movement" value="No admin charge, transfer, payout, or refund controls" status="Healthy" />
          </div>
        </AdminSection>
        <AdminSection title="Restricted tools" description="These controls remain disabled until auditable, record-specific workflows are implemented.">
          <div className="grid gap-2">
            <button disabled className="flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left text-sm">
              <span><span className="block font-semibold">Impersonate user</span><span className="mt-1 block text-xs text-[var(--muted)]">Not implemented for security reasons.</span></span>
              <ShieldAlert className="h-4 w-4 text-[var(--muted)]" />
            </button>
            <button disabled className="flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left text-sm">
              <span><span className="block font-semibold">Automated record repair</span><span className="mt-1 block text-xs text-[var(--muted)]">Use the operations center for read-only diagnosis.</span></span>
              <ShieldAlert className="h-4 w-4 text-[var(--muted)]" />
            </button>
            <button disabled className="flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left text-sm">
              <span><span className="block font-semibold">Move or refund money</span><span className="mt-1 block text-xs text-[var(--muted)]">Intentionally unavailable in Nexus admin.</span></span>
              <ShieldAlert className="h-4 w-4 text-[var(--muted)]" />
            </button>
          </div>
        </AdminSection>
      </section>
      <AdminSection title="Configuration links" description="Open focused diagnostics without exposing environment values.">
        <div className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["/admin/system-health", "System health"],
            ["/admin/email", "Email diagnostics"],
            ["/admin/stripe", "Stripe diagnostics"],
            ["/admin/operations", "Data integrity"]
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex items-center justify-between bg-white p-4 text-sm font-semibold hover:bg-[var(--surface)]">
              {label}
              <ExternalLink className="h-4 w-4 text-[var(--muted)]" />
            </Link>
          ))}
        </div>
      </AdminSection>
    </div>
  );
}

function Funnel({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const first = rows[0]?.count ?? 0;
  return (
    <AdminSection title={title} description="Stored-record conversion, not client-side click analytics.">
      <div className="space-y-3">
        {rows.map((row, index) => {
          const width = first ? Math.max(4, (row.count / first) * 100) : 4;
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{index + 1}. {row.label}</span>
                <span className="text-sm font-semibold tabular-nums">{row.count}</span>
              </div>
              <div className="mt-2 h-8 bg-[var(--surface)]">
                <div className="flex h-full items-center bg-[var(--brand)] px-2 text-xs font-semibold text-white" style={{ width: `${width}%` }}>
                  {first ? `${Math.round((row.count / first) * 100)}%` : "0%"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AdminSection>
  );
}

function SettingRow({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{value}</p>
      </div>
      <AdminStatusBadge status={status} />
    </div>
  );
}
