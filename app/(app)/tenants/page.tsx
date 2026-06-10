import Link from "next/link";
import { Plus, Users } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { PhoneInput } from "@/components/ui/phone-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTenantAction } from "@/lib/actions";
import { requireRouteAccess } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | null) {
  return value ? formatDate(value) : "Not set";
}

function sortHref(params: Record<string, string>, sort: string) {
  const next = new URLSearchParams();
  for (const key of ["q", "propertyId", "status"]) {
    if (params[key]) next.set(key, params[key]);
  }
  next.set("sort", sort);
  return `/tenants?${next.toString()}`;
}

export default async function TenantsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRouteAccess("/tenants");
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const propertyFilter = params.propertyId ?? "all";
  const statusFilter = params.status ?? "all";
  const sort = params.sort ?? "name";
  const showCreate = params.create === "1";

  const rows = portal.scope.tenants.map((tenant) => {
    const currentLease = portal.scope.leases
      .filter((lease) => lease.tenantIds.includes(tenant.id))
      .sort((a, b) => (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt))[0];
    const unit = currentLease?.unitId ? portal.scope.units.find((item) => item.id === currentLease.unitId) : null;
    const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;
    const balance = unit
      ? portal.scope.payments
          .filter((payment) => {
            if (payment.status === "PAID") return false;
            if (payment.tenantId) return payment.tenantId === tenant.id;
            if (currentLease && payment.leaseId) return payment.leaseId === currentLease.id;
            return !payment.leaseId && payment.unitId === unit.id;
          })
          .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0)
      : 0;

    return { tenant, currentLease, unit, property, balance };
  });

  const filtered = rows
    .filter((row) => {
      const text = `${row.tenant.firstName} ${row.tenant.lastName} ${row.tenant.email ?? ""} ${row.tenant.phone ?? ""} ${row.property?.name ?? ""} ${row.unit?.unitNumber ?? ""}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
      if (statusFilter !== "all" && row.currentLease?.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "property") return (a.property?.name ?? "").localeCompare(b.property?.name ?? "");
      if (sort === "rent") return (b.currentLease?.monthlyRent ?? 0) - (a.currentLease?.monthlyRent ?? 0);
      if (sort === "balance") return b.balance - a.balance;
      if (sort === "moveIn") return (a.currentLease?.moveInDate ?? a.currentLease?.startDate ?? "9999").localeCompare(b.currentLease?.moveInDate ?? b.currentLease?.startDate ?? "9999");
      return `${a.tenant.lastName} ${a.tenant.firstName}`.localeCompare(`${b.tenant.lastName} ${b.tenant.firstName}`);
    });

  const activeTenants = rows.filter((row) => row.currentLease && ["ACTIVE", "active"].includes(row.currentLease.status)).length;
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const monthlyRent = rows.reduce((sum, row) => sum + (row.currentLease?.monthlyRent ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "People" : "Resident roster"}
        title="Tenants"
        description="A compact resident directory with lease placement, rent, balance, contact information, and move-in context."
        actions={
          <Link href="/tenants?create=1" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
            <Plus className="h-4 w-4" />
            New Tenant
          </Link>
        }
      />

      <section className="ops-grid">
        <StatCard label="Tenants" value={String(rows.length)} detail={`${filtered.length} shown`} tone="brand" />
        <StatCard label="Active leases" value={String(activeTenants)} detail="Connected to occupied units" tone="success" />
        <StatCard label="Monthly rent" value={formatCurrency(monthlyRent)} detail="Current lease rent" tone="brand" />
        <StatCard label="Balance due" value={formatCurrency(totalBalance)} detail="Open resident balances" tone={totalBalance ? "danger" : "success"} />
      </section>

      <DetailSection title="Tenant register" description="Search and filter residents across the current property scope.">
        <FilterBar
          action="/tenants"
          query={params.q}
          queryPlaceholder="Search tenant, email, phone, property, or unit"
          hidden={{ sort }}
          filters={[
            {
              name: "propertyId",
              label: "Property",
              value: propertyFilter,
              options: [
                { label: "All properties", value: "all" },
                ...portal.scope.properties.map((property) => ({ label: property.name, value: property.id }))
              ]
            },
            {
              name: "status",
              label: "Lease status",
              value: statusFilter,
              options: [
                { label: "All lease states", value: "all" },
                { label: "Active", value: "ACTIVE" },
                { label: "Upcoming", value: "UPCOMING" },
                { label: "Expired", value: "EXPIRED" },
                { label: "Terminated", value: "TERMINATED" }
              ]
            }
          ]}
        />

        {filtered.length ? (
          <DataTable
            className="tenant-register-table mt-4"
            minWidth="52rem"
            columns={[
              <Link key="name" href={sortHref(params, "name")} className="sort-link">Name</Link>,
              <Link key="property" href={sortHref(params, "property")} className="sort-link">Property / unit</Link>,
              "Lease",
              "Financials",
              "Contact",
              ""
            ]}
          >
            {filtered.map((row) => (
              <tr key={row.tenant.id} className="table-row">
                <td className="table-cell font-semibold">{row.tenant.firstName} {row.tenant.lastName}</td>
                <td className="table-cell">
                  {row.property && row.unit ? (
                    <Link href={`/units/${row.unit.id}`} className="table-link font-medium">
                      {row.property.name}
                      <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">Unit {row.unit.unitNumber}</span>
                    </Link>
                  ) : (
                    <span className="text-[var(--muted)]">No active placement</span>
                  )}
                </td>
                <td className="table-cell">
                  <StatusBadge status={row.currentLease?.status ?? "No lease"} />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Move-in {formatDateOrUnset(row.currentLease?.moveInDate ?? row.currentLease?.startDate)}
                  </span>
                </td>
                <td className="table-cell">
                  <span className="block font-semibold">{row.currentLease ? `${formatCurrency(row.currentLease.monthlyRent)}/mo` : "Rent not set"}</span>
                  <span className={`mt-0.5 block text-xs font-semibold ${row.balance ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                    {formatCurrency(row.balance)} balance
                  </span>
                </td>
                <td className="table-cell text-[var(--muted)]">
                  <span className="block max-w-52 truncate">{row.tenant.email || "No email"}</span>
                  <span className="mt-0.5 block text-xs">{row.tenant.phone || "No phone"}</span>
                </td>
                <td className="table-cell text-right">
                  <RowActionsMenu>
                    {row.unit ? <RowActionLink href={`/units/${row.unit.id}`}>View unit</RowActionLink> : null}
                    {row.currentLease ? <RowActionLink href={`/leases/${row.currentLease.id}`}>View lease</RowActionLink> : null}
                    <RowActionLink href="/leases">Add lease</RowActionLink>
                    {row.unit ? <RowActionLink href={`/transactions?create=1&unitId=${row.unit.id}`}>Record payment</RowActionLink> : null}
                    <RowActionLink href="/messages">Message tenant</RowActionLink>
                  </RowActionsMenu>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <div className="mt-4">
            <EmptyState icon={Users} title="No tenants match" description="Adjust search or filters, or add a tenant record." action={<Link href="/tenants?create=1" className="inline-flex items-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"><Plus className="h-4 w-4" />Add tenant</Link>} />
          </div>
        )}
      </DetailSection>

      {showCreate ? (
        <DetailSection id="create" title="Create tenant" description="Add a resident profile, then connect them to a lease from the lease board or move-in flow.">
          <form action={createTenantAction} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="form-grid-2">
                <input name="firstName" placeholder="First name" className="field" />
                <input name="lastName" placeholder="Last name" className="field" />
              </div>
              <input name="email" type="email" placeholder="Email" className="field" />
              <PhoneInput name="phone" placeholder="Phone" />
            </div>
            <div className="space-y-4">
              <input name="employer" placeholder="Employer" className="field" />
              <div className="form-grid-2">
                <input name="emergencyName" placeholder="Emergency contact" className="field" />
                <PhoneInput name="emergencyPhone" placeholder="Emergency phone" autoComplete="tel" />
              </div>
              <textarea name="notes" placeholder="Notes" className="field min-h-24" />
              <div className="flex gap-2">
                <SubmitButton>Create tenant</SubmitButton>
                <Link href="/tenants" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]">
                  Cancel
                </Link>
              </div>
            </div>
          </form>
        </DetailSection>
      ) : null}
    </div>
  );
}
