import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";

import { AdminDataTable } from "@/components/admin/admin-data-table";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatGrid } from "@/components/admin/admin-stat-grid";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { refreshManagerStripeAction } from "@/lib/admin-actions";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { formatAppDate, formatAppDateTime } from "@/lib/app-time";
import { requireSystemAdmin } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";

export default async function AdminManagerDetailPage({ params }: { params: Promise<{ managerId: string }> }) {
  await requireSystemAdmin();
  const { managerId } = await params;
  const data = await getAdminAnalytics("all");
  const manager = data.managers.find((item) => item.id === managerId);
  const user = data.users.find((item) => item.id === managerId);
  if (!manager || !user) notFound();

  const properties = data.properties.filter((item) => item.managerId === managerId);
  const leases = data.leases.filter((item) => item.managerId === managerId);
  const payments = data.payments.rows.filter((item) => item.managerId === managerId);
  const applications = data.applications.rows.filter((item) => item.managerId === managerId);
  const stripe = data.stripe.rows.find((item) => item.id === managerId);
  const emailEvents = data.email.events.filter((item) => item.userId === managerId);
  const issues = data.operations.issues.filter((item) => item.entityId.includes(managerId) || item.href === `/admin/managers/${managerId}`);
  const checklist = [
    ["Account created", true],
    ["Account active", manager.isActive],
    ["Property added", manager.propertyCount > 0],
    ["Unit added", manager.unitCount > 0],
    ["Lease created", manager.leaseCount > 0],
    ["Tenant invited", emailEvents.some((item) => ["tenant_invite", "move_in_invite"].includes(item.category) && item.type === "EMAIL_SENT")],
    ["Payment request sent", manager.paymentCount > 0],
    ["Stripe connected", stripe?.state === "ready"],
    ["First payment collected", manager.paymentVolume > 0]
  ] as const;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={manager.name}
        description={`${manager.email} · ${manager.organization} · Manager account created ${formatAppDateTime(manager.createdAt)}`}
        actions={
          <div className="flex items-center gap-3">
            <Link href={`/admin/users/${manager.id}`} className="text-sm font-semibold text-[var(--brand)]">Edit account</Link>
            <Link href="/admin/managers" className="text-sm font-semibold text-[var(--muted)]">Back to managers</Link>
          </div>
        }
      />
      <AdminStatGrid>
        <AdminMetricCard label="Properties" value={manager.propertyCount} detail={`${manager.unitCount} units`} tone="brand" />
        <AdminMetricCard label="Tenants" value={manager.tenantCount} detail={`${manager.leaseCount} leases`} />
        <AdminMetricCard label="Rent roll" value={formatCurrency(manager.rentVolume)} detail="Scheduled monthly rent" />
        <AdminMetricCard label="Collected" value={formatCurrency(manager.paymentVolume)} detail={`${manager.paymentCount} payment records`} tone="success" />
        <AdminMetricCard label="Open balance" value={formatCurrency(manager.openBalance)} detail="Current unpaid charges" tone={manager.openBalance ? "warning" : "success"} />
        <AdminMetricCard label="Setup progress" value={`${manager.setupProgress}%`} detail={manager.setupComplete ? "Core setup complete" : "Workflow steps remain"} tone={manager.setupComplete ? "success" : "warning"} />
        <AdminMetricCard label="Stripe" value={manager.stripeStatus} detail={stripe?.updatedAt ? `Checked ${formatAppDateTime(stripe.updatedAt)}` : "Not refreshed"} tone={stripe?.state === "ready" ? "success" : "warning"} />
        <AdminMetricCard label="Last login" value={manager.lastLoginAt ? formatAppDate(manager.lastLoginAt) : "Not recorded"} detail={manager.lastLoginAt ? formatAppDateTime(manager.lastLoginAt) : "Tracking starts after deployment"} />
      </AdminStatGrid>

      <section className="ops-split">
        <AdminSection title="Setup checklist" description="Activation milestones from account creation through first collection.">
          <div className="divide-y divide-[var(--line)]">
            {checklist.map(([label, complete]) => {
              const Icon = complete ? CheckCircle2 : Circle;
              return (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className={complete ? "h-4 w-4 text-[var(--success)]" : "h-4 w-4 text-[var(--muted)]"} />
                    {label}
                  </span>
                  <AdminStatusBadge status={complete ? "Complete" : "Incomplete"} />
                </div>
              );
            })}
          </div>
        </AdminSection>
        <AdminSection title="Stripe Connect status" description="Safe diagnostics and account status refresh. No money-moving controls.">
          <div className="space-y-3">
            {[
              ["Status", stripe?.status ?? "Not configured"],
              ["Account ID", stripe?.accountId ?? "Not created"],
              ["Charges", stripe?.chargesEnabled ? "Enabled" : "Missing"],
              ["Payouts", stripe?.payoutsEnabled ? "Enabled" : "Missing"],
              ["Details", stripe?.detailsSubmitted ? "Submitted" : "Incomplete"],
              ["Disabled reason", stripe?.disabledReason ?? "None"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-2.5 last:border-b-0">
                <span className="text-sm font-semibold">{label}</span>
                <span className="max-w-64 break-all text-right text-sm text-[var(--muted)]">{value}</span>
              </div>
            ))}
          </div>
          {stripe?.accountId ? (
            <form action={refreshManagerStripeAction} className="mt-4">
              <input type="hidden" name="managerId" value={manager.id} />
              <button type="submit" className="border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-semibold hover:bg-[var(--surface)]">Refresh Stripe status</button>
            </form>
          ) : null}
        </AdminSection>
      </section>

      <AdminSection title="Properties and units" description="Assets currently assigned to this manager.">
        <AdminDataTable columns={["Property", "Units", "Occupancy", "Active leases", "Rent roll", "Open", "Overdue"]} minWidth="56rem">
          {properties.map((property) => (
            <tr key={property.id} className="table-row">
              <td className="table-cell"><p className="font-semibold">{property.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{property.address}</p></td>
              <td className="table-cell">{property.units}</td>
              <td className="table-cell">{property.units ? `${Math.round((property.occupiedUnits / property.units) * 100)}%` : "No units"}</td>
              <td className="table-cell">{property.activeLeases}</td>
              <td className="table-cell font-semibold">{formatCurrency(property.rentRoll)}</td>
              <td className="table-cell font-semibold">{formatCurrency(property.openBalance)}</td>
              <td className="table-cell font-semibold text-[var(--danger)]">{formatCurrency(property.overdueBalance)}</td>
            </tr>
          ))}
        </AdminDataTable>
      </AdminSection>

      <section className="ops-split">
        <AdminSection title="Leases" description="Most recent lease records in the manager portfolio.">
          <AdminDataTable columns={["Lease", "Property / unit", "Tenant", "Status", "Rent", "Dates"]} minWidth="54rem">
            {leases.slice(0, 12).map((lease) => (
              <tr key={lease.id} className="table-row">
                <td className="table-cell font-semibold">{lease.nexusLeaseId}</td>
                <td className="table-cell text-[var(--muted)]">{lease.property} / {lease.unit}</td>
                <td className="table-cell">{lease.tenants}</td>
                <td className="table-cell"><AdminStatusBadge status={lease.status} /></td>
                <td className="table-cell font-semibold">{formatCurrency(lease.monthlyRent)}</td>
                <td className="table-cell text-[var(--muted)]">{lease.startDate ? formatAppDate(lease.startDate) : "Unset"} – {lease.endDate ? formatAppDate(lease.endDate) : "Unset"}</td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
        <AdminSection title="Applications" description="Recent applicant submissions owned by this manager.">
          <AdminDataTable columns={["Applicant", "Property", "Status", "Submitted"]} minWidth="38rem">
            {applications.slice(0, 12).map((item) => (
              <tr key={item.id} className="table-row">
                <td className="table-cell"><p className="font-semibold">{item.applicant}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{item.email}</p></td>
                <td className="table-cell text-[var(--muted)]">{item.property} / {item.unit}</td>
                <td className="table-cell"><AdminStatusBadge status={item.status} /></td>
                <td className="table-cell text-[var(--muted)]">{formatAppDate(item.submittedAt)}</td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
      </section>

      <section className="ops-split">
        <AdminSection title="Payments" description="Recent payment records linked to manager properties.">
          <AdminDataTable columns={["Payment", "Tenant", "Status", "Amount", "Balance", "Source"]} minWidth="48rem">
            {payments.slice(0, 15).map((payment) => (
              <tr key={payment.id} className="table-row">
                <td className="table-cell"><p className="font-semibold">{payment.description}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{payment.property} / {payment.unit}</p></td>
                <td className="table-cell">{payment.tenant}</td>
                <td className="table-cell"><AdminStatusBadge status={payment.status} /></td>
                <td className="table-cell font-semibold">{formatCurrency(payment.amount)}</td>
                <td className="table-cell font-semibold">{formatCurrency(payment.balanceDue)}</td>
                <td className="table-cell"><AdminStatusBadge status={payment.source} /></td>
              </tr>
            ))}
          </AdminDataTable>
        </AdminSection>
        <AdminSection title="Email, invites, and integrity" description="Recent delivery activity and manager-specific platform warnings.">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Email events</p>
              <div className="mt-2 divide-y divide-[var(--line)]">
                {emailEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                    <div><p className="text-sm font-semibold capitalize">{event.category.replaceAll("_", " ")}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{formatAppDateTime(event.createdAt)}</p></div>
                    <AdminStatusBadge status={event.status} />
                  </div>
                ))}
                {!emailEvents.length ? <p className="text-sm text-[var(--muted)]">No stored email events for this manager.</p> : null}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Integrity warnings</p>
              <div className="mt-2 divide-y divide-[var(--line)]">
                {issues.slice(0, 8).map((issue) => (
                  <div key={issue.id} className="flex items-start justify-between gap-3 py-2 first:pt-0">
                    <div><p className="text-sm font-semibold">{issue.title}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{issue.detail}</p></div>
                    <AdminStatusBadge status={issue.severity} />
                  </div>
                ))}
                {!issues.length ? <p className="text-sm text-[var(--muted)]">No manager-specific integrity findings.</p> : null}
              </div>
            </div>
          </div>
        </AdminSection>
      </section>
    </div>
  );
}
