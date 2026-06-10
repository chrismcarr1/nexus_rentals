import Link from "next/link";
import { Building2, LayoutGrid, Plus } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { SingleUploadInput } from "@/components/upload-inputs";
import { createUnitAction } from "@/lib/actions";
import { requireRouteAccess } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | null) {
  return value ? formatDate(value) : "Not set";
}

function sortHref(params: Record<string, string>, sort: string) {
  const next = new URLSearchParams();
  for (const key of ["q", "propertyId", "occupancy"]) {
    if (params[key]) next.set(key, params[key]);
  }
  next.set("sort", sort);
  return `/units?${next.toString()}`;
}

export default async function UnitsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRouteAccess("/units");
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const propertyFilter = params.propertyId ?? "all";
  const occupancyFilter = params.occupancy ?? "all";
  const sort = params.sort ?? "unit";
  const showCreate = params.create === "1";

  const rows = portal.scope.units.map((unit) => {
    const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
    const lease = portal.scope.leases
      .filter((item) => item.unitId === unit.id)
      .sort((a, b) => (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt))[0];
    const tenants = lease?.tenantIds
      .map((tenantId) => portal.scope.tenants.find((tenant) => tenant.id === tenantId))
      .filter(Boolean) ?? [];
    const balanceDue = portal.scope.payments
      .filter((payment) => payment.unitId === unit.id && payment.status !== "PAID")
      .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);

    return { unit, property, lease, tenants, balanceDue };
  });

  const filtered = rows
    .filter((row) => {
      const text = `${row.unit.unitNumber} ${row.property?.name ?? ""} ${row.tenants.map((tenant) => `${tenant?.firstName} ${tenant?.lastName}`).join(" ")}`.toLowerCase();
      if (query && !text.includes(query)) return false;
      if (propertyFilter !== "all" && row.unit.propertyId !== propertyFilter) return false;
      if (occupancyFilter !== "all" && row.unit.occupancyStatus !== occupancyFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "property") return (a.property?.name ?? "").localeCompare(b.property?.name ?? "");
      if (sort === "rent") return b.unit.monthlyRent - a.unit.monthlyRent;
      if (sort === "balance") return b.balanceDue - a.balanceDue;
      if (sort === "leaseEnd") return (a.lease?.endDate ?? "9999").localeCompare(b.lease?.endDate ?? "9999");
      return a.unit.unitNumber.localeCompare(b.unit.unitNumber, undefined, { numeric: true });
    });

  const occupied = rows.filter((row) => row.unit.occupancyStatus === "OCCUPIED").length;
  const vacant = rows.length - occupied;
  const totalBalance = rows.reduce((sum, row) => sum + row.balanceDue, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Unit inventory"
        title="Units"
        description="Filter every unit by property, tenant, occupancy, rent, and balance without opening individual property pages."
        actions={
          <Link href="/units?create=1" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
            <Plus className="h-4 w-4" />
            New Unit
          </Link>
        }
      />

      <section className="ops-grid">
        <StatCard label="Units" value={String(rows.length)} detail={`${filtered.length} shown`} tone="brand" />
        <StatCard label="Occupied" value={String(occupied)} detail={`${Math.round((occupied / Math.max(rows.length, 1)) * 100)}% occupancy`} tone="success" />
        <StatCard label="Vacant" value={String(vacant)} detail="Vacant, notice, or turnover" tone={vacant ? "warning" : "success"} />
        <StatCard label="Balance due" value={formatCurrency(totalBalance)} detail="Open ledger balance" tone={totalBalance ? "danger" : "success"} />
      </section>

      <DetailSection title="Unit register" description="Table-first navigation across the full managed inventory.">
        <FilterBar
          action="/units"
          query={params.q}
          queryPlaceholder="Search unit, property, or tenant"
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
              name: "occupancy",
              label: "Occupancy",
              value: occupancyFilter,
              options: [
                { label: "All occupancy", value: "all" },
                { label: "Occupied", value: "OCCUPIED" },
                { label: "Vacant", value: "VACANT" },
                { label: "Notice", value: "NOTICE" },
                { label: "Turnover", value: "TURNOVER" }
              ]
            }
          ]}
        />

        {filtered.length ? (
          <DataTable
            className="mt-4"
            minWidth="56rem"
            columns={[
              <Link key="unit" href={sortHref(params, "unit")} className="sort-link">Unit</Link>,
              <Link key="property" href={sortHref(params, "property")} className="sort-link">Property</Link>,
              "Tenant",
              <Link key="rent" href={sortHref(params, "rent")} className="sort-link">Rent</Link>,
              <Link key="leaseEnd" href={sortHref(params, "leaseEnd")} className="sort-link">Lease end</Link>,
              <Link key="balance" href={sortHref(params, "balance")} className="sort-link">Balance due</Link>,
              "Occupancy",
              ""
            ]}
          >
            {filtered.map((row) => (
              <tr key={row.unit.id} className="table-row">
                <td className="table-cell">
                  <Link href={`/units/${row.unit.id}`} className="table-link font-semibold">
                    Unit {row.unit.unitNumber}
                    <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">{row.unit.nickname || row.unit.unitType}</span>
                  </Link>
                </td>
                <td className="table-cell">
                  {row.property ? (
                    <Link href={`/properties/${row.property.id}`} className="table-link font-medium">{row.property.name}</Link>
                  ) : (
                    <span className="text-[var(--muted)]">Property unavailable</span>
                  )}
                </td>
                <td className="table-cell text-[var(--muted)]">
                  {row.tenants.length ? row.tenants.map((tenant) => `${tenant?.firstName} ${tenant?.lastName}`).join(", ") : "No tenant"}
                </td>
                <td className="table-cell font-semibold">{formatCurrency(row.unit.monthlyRent)}</td>
                <td className="table-cell text-[var(--muted)]">{formatDateOrUnset(row.lease?.endDate)}</td>
                <td className="table-cell font-semibold">{formatCurrency(row.balanceDue)}</td>
                <td className="table-cell"><StatusBadge status={row.unit.occupancyStatus} /></td>
                <td className="table-cell text-right">
                  <RowActionsMenu>
                    <RowActionLink href={`/units/${row.unit.id}`}>View</RowActionLink>
                    <RowActionLink href={`/leases?unitId=${row.unit.id}`}>Add lease</RowActionLink>
                    <RowActionLink href="/tenants?create=1">Add tenant</RowActionLink>
                    <RowActionLink href={`/move-ins/new?propertyId=${row.unit.propertyId}&unitId=${row.unit.id}`}>Start move-in</RowActionLink>
                    <RowActionLink href={`/transactions?create=1&unitId=${row.unit.id}`}>Record payment</RowActionLink>
                  </RowActionsMenu>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <div className="mt-4">
            <EmptyState icon={LayoutGrid} title="No units match" description="Adjust filters or add a new unit to one of your properties." />
          </div>
        )}
      </DetailSection>

      {showCreate ? (
        <DetailSection id="create" title="Create unit" description="Add inventory to an existing property.">
          {!portal.scope.properties.length ? (
            <EmptyState icon={Building2} title="Create a property first" description="Units must belong to a property before they can be tracked." />
          ) : (
            <form action={createUnitAction} className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <select name="propertyId" defaultValue={params.propertyId ?? portal.scope.properties[0]?.id} className="field">
                  {portal.scope.properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name}</option>
                  ))}
                </select>
                <div className="form-grid-2">
                  <input name="unitNumber" placeholder="Unit number" className="field" />
                  <input name="nickname" placeholder="Nickname" className="field" />
                </div>
                <input name="unitType" placeholder="Unit type" className="field" />
                <div className="form-grid-3">
                  <input name="bedrooms" type="number" step="1" placeholder="Bedrooms" className="field" />
                  <input name="bathrooms" type="number" step="0.5" placeholder="Bathrooms" className="field" />
                  <input name="squareFeet" type="number" step="1" placeholder="Sq ft" className="field" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="form-grid-2">
                  <input name="monthlyRent" type="number" step="0.01" placeholder="Monthly rent" className="field" />
                  <input name="depositAmount" type="number" step="0.01" placeholder="Deposit" className="field" />
                </div>
                <div className="form-grid-2">
                  <select name="occupancyStatus" className="field">
                    <option value="VACANT">Vacant</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="NOTICE">Notice</option>
                    <option value="TURNOVER">Turnover</option>
                  </select>
                  <select name="leaseStatus" className="field">
                    <option value="UPCOMING">Upcoming</option>
                    <option value="ACTIVE">Active</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </div>
                <textarea name="amenities" placeholder="Amenities, comma separated" className="field min-h-24" />
                <SingleUploadInput name="imagePath" label="Upload unit image" />
                <div className="flex gap-2">
                  <SubmitButton>Create unit</SubmitButton>
                  <Link href="/units" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]">
                    Cancel
                  </Link>
                </div>
              </div>
            </form>
          )}
        </DetailSection>
      ) : null}
    </div>
  );
}
