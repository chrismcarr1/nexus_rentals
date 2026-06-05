import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { AddressFields } from "@/components/address-fields";
import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { MultiUploadInput } from "@/components/upload-inputs";
import { archivePropertyAction, assignPropertyManagerAction, createPropertyAction } from "@/lib/actions";
import { formatAddress } from "@/lib/address";
import { requireRouteAccess } from "@/lib/auth";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function sortHref(params: Record<string, string>, sort: string) {
  const next = new URLSearchParams();
  for (const key of ["q", "status", "occupancy", "view"]) {
    if (params[key]) next.set(key, params[key]);
  }
  next.set("sort", sort);
  return `/properties?${next.toString()}`;
}

function matchesText(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

export default async function PropertiesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRouteAccess("/properties");
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "all";
  const occupancyFilter = params.occupancy ?? "all";
  const sort = params.sort ?? "name";
  const view = params.view === "cards" ? "cards" : "table";
  const showCreate = params.create === "1";
  const propertyCoverImages = new Map<string, string>();

  for (const file of portal.scope.files
    .filter((file) => file.kind === "PROPERTY_IMAGE" && file.propertyId && isAllowedStoredAssetPath(file.path, { allowDemo: true }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    propertyCoverImages.set(file.propertyId!, file.path);
  }

  const rows = portal.scope.properties.map((property) => {
    const units = portal.scope.units.filter((unit) => unit.propertyId === property.id);
    const occupied = units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
    const vacant = units.length - occupied;
    const rentRoll = units.reduce((sum, unit) => sum + unit.monthlyRent, 0);
    const openMaintenance = portal.scope.maintenance.filter((item) => item.propertyId === property.id && item.status !== "RESOLVED" && item.status !== "CLOSED").length;
    const delinquentTenants = new Set(
      portal.overduePayments
        .filter((payment) => units.some((unit) => unit.id === payment.unitId))
        .flatMap((payment) => {
          const lease = payment.leaseId ? portal.scope.leases.find((item) => item.id === payment.leaseId) : null;
          return lease?.tenantIds ?? [];
        })
    ).size;
    const occupancyRate = units.length ? occupied / units.length : 0;
    const recentActivity = [
      property.updatedAt,
      ...portal.scope.maintenance.filter((item) => item.propertyId === property.id).map((item) => item.updatedAt),
      ...portal.scope.expenses.filter((expense) => expense.propertyId === property.id).map((expense) => expense.createdAt)
    ].sort((a, b) => b.localeCompare(a))[0] ?? property.updatedAt;

    return {
      property,
      units,
      occupied,
      vacant,
      rentRoll,
      openMaintenance,
      delinquentTenants,
      occupancyRate,
      recentActivity,
      coverImagePath: propertyCoverImages.get(property.id)
    };
  });

  const filtered = rows
    .filter((row) => {
      if (query && !matchesText(`${row.property.name} ${formatAddress(row.property)}`, query)) return false;
      if (statusFilter !== "all" && row.property.status !== statusFilter) return false;
      if (occupancyFilter === "full" && row.vacant > 0) return false;
      if (occupancyFilter === "has-vacancy" && row.vacant === 0) return false;
      if (occupancyFilter === "vacant" && row.occupied > 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "units") return b.units.length - a.units.length;
      if (sort === "rent") return b.rentRoll - a.rentRoll;
      if (sort === "occupancy") return b.occupancyRate - a.occupancyRate;
      if (sort === "recent") return b.recentActivity.localeCompare(a.recentActivity);
      return a.property.name.localeCompare(b.property.name);
    });

  const totalRentRoll = rows.reduce((sum, row) => sum + row.rentRoll, 0);
  const occupiedUnits = rows.reduce((sum, row) => sum + row.occupied, 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.units.length, 0);
  const vacantUnits = totalUnits - occupiedUnits;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Portfolio" : "Assigned portfolio"}
        title="Properties"
        description="A scalable property register for scanning occupancy, rent roll, maintenance exceptions, and delinquency without image-card browsing."
        actions={
          <Link href="/properties?create=1" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
            <Plus className="h-4 w-4" />
            New Property
          </Link>
        }
      />

      <section className="ops-grid">
        <StatCard label="Properties" value={String(rows.length)} detail={`${filtered.length} shown`} tone="brand" />
        <StatCard label="Units" value={String(totalUnits)} detail={`${occupiedUnits} occupied`} />
        <StatCard label="Vacant units" value={String(vacantUnits)} detail="Vacant, notice, or turnover" tone={vacantUnits ? "warning" : "success"} />
        <StatCard label="Monthly rent roll" value={formatCurrency(totalRentRoll)} detail="Scheduled unit rent" tone="brand" />
      </section>

      <DetailSection
        title="Property register"
        description="Search, filter, sort, and open property detail pages from a dense operating table."
        actions={
          <div className="flex gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] p-1">
            <Link href={`/properties?${new URLSearchParams({ ...params, view: "table" }).toString()}`} className={`rounded px-2 py-1 text-xs font-semibold ${view === "table" ? "bg-white text-[var(--text)]" : "text-[var(--muted)]"}`}>Table</Link>
            <Link href={`/properties?${new URLSearchParams({ ...params, view: "cards" }).toString()}`} className={`rounded px-2 py-1 text-xs font-semibold ${view === "cards" ? "bg-white text-[var(--text)]" : "text-[var(--muted)]"}`}>Compact</Link>
          </div>
        }
      >
        <FilterBar
          action="/properties"
          query={query}
          queryPlaceholder="Search property name or address"
          hidden={{ sort, view }}
          filters={[
            {
              name: "status",
              label: "Status",
              value: statusFilter,
              options: [
                { label: "All statuses", value: "all" },
                { label: "Active", value: "ACTIVE" },
                { label: "Archived", value: "ARCHIVED" }
              ]
            },
            {
              name: "occupancy",
              label: "Occupancy",
              value: occupancyFilter,
              options: [
                { label: "All occupancy", value: "all" },
                { label: "Fully occupied", value: "full" },
                { label: "Has vacancy", value: "has-vacancy" },
                { label: "Fully vacant", value: "vacant" }
              ]
            }
          ]}
        />

        {filtered.length ? (
          view === "table" ? (
            <DataTable
              className="mt-4"
              minWidth="72rem"
              columns={[
                <Link key="name" href={sortHref(params, "name")} className="sort-link">Property</Link>,
                "Address",
                <Link key="units" href={sortHref(params, "units")} className="sort-link">Units</Link>,
                <Link key="occupancy" href={sortHref(params, "occupancy")} className="sort-link">Occupancy</Link>,
                <Link key="rent" href={sortHref(params, "rent")} className="sort-link">Rent roll</Link>,
                "Maintenance",
                "Delinquent",
                "Status",
                ""
              ]}
            >
              {filtered.map((row) => (
                <tr key={row.property.id} className="table-row">
                  <td className="table-cell">
                    <Link href={`/properties/${row.property.id}`} className="table-link flex items-center gap-3">
                      {row.coverImagePath ? (
                        <img src={row.coverImagePath} alt="" className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]">
                          <Building2 className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{row.property.name}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">Updated {formatDate(row.recentActivity)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="table-cell max-w-80 text-[var(--muted)]">{formatAddress(row.property)}</td>
                  <td className="table-cell font-semibold">{row.units.length}</td>
                  <td className="table-cell">
                    <span className="font-semibold">{Math.round(row.occupancyRate * 100)}%</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">{row.occupied}/{row.units.length}</span>
                  </td>
                  <td className="table-cell font-semibold">{formatCurrency(row.rentRoll)}</td>
                  <td className="table-cell">{row.openMaintenance ? <StatusBadge status={`${row.openMaintenance} open`} tone="warning" /> : <StatusBadge status="Clear" tone="success" />}</td>
                  <td className="table-cell">{row.delinquentTenants ? <StatusBadge status={`${row.delinquentTenants} delinquent`} tone="danger" /> : <StatusBadge status="Clear" tone="success" />}</td>
                  <td className="table-cell"><StatusBadge status={row.property.status} /></td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={`/properties/${row.property.id}`}>View</RowActionLink>
                      <RowActionLink href={`/properties/${row.property.id}#edit`}>Edit</RowActionLink>
                      <RowActionLink href={`/units?create=1&propertyId=${row.property.id}`}>Add unit</RowActionLink>
                      <RowActionLink href={`/leases?propertyId=${row.property.id}`}>Add lease</RowActionLink>
                      <RowActionLink href={`/move-ins/new?propertyId=${row.property.id}`}>Start move-in</RowActionLink>
                      {user.role === "ADMIN" ? (
                        <form action={archivePropertyAction}>
                          <input type="hidden" name="propertyId" value={row.property.id} />
                          <button type="submit" className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50">
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((row) => (
                <Link key={row.property.id} href={`/properties/${row.property.id}`} className="rounded-md border border-[var(--line)] bg-white p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{row.property.name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">{formatAddress(row.property)}</p>
                    </div>
                    <StatusBadge status={row.property.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                    <div><p className="font-semibold">{row.units.length}</p><p className="text-xs text-[var(--muted)]">units</p></div>
                    <div><p className="font-semibold">{Math.round(row.occupancyRate * 100)}%</p><p className="text-xs text-[var(--muted)]">occ</p></div>
                    <div><p className="font-semibold">{row.vacant}</p><p className="text-xs text-[var(--muted)]">vacant</p></div>
                    <div><p className="font-semibold">{row.openMaintenance}</p><p className="text-xs text-[var(--muted)]">open</p></div>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="mt-4">
            <EmptyState title="No properties match" description="Adjust search or filters, or create the first property in this portfolio." />
          </div>
        )}
      </DetailSection>

      {showCreate ? (
        <DetailSection id="create" title={user.role === "ADMIN" ? "Create property" : "Create assigned property"} description="Add a portfolio asset without leaving the property register.">
          {params.error ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {params.error === "invalid-address"
                ? "Enter a complete property address with street, city, state, ZIP or postal code, and country."
                : "Review the property details and try again."}
            </div>
          ) : null}
          <form action={createPropertyAction} className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <input name="name" placeholder="Property name" className="field" />
              <AddressFields />
              <textarea name="description" placeholder="Asset summary" className="field min-h-24" />
            </div>
            <div className="space-y-4">
              <input name="amenities" placeholder="Amenities, comma separated" className="field" />
              {user.role === "ADMIN" ? (
                <select name="managerId" className="field">
                  <option value="">Unassigned manager</option>
                  {portal.managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.firstName} {manager.lastName}
                    </option>
                  ))}
                </select>
              ) : null}
              <MultiUploadInput name="imagePaths" label="Upload property photos" accept="image/*" />
              <div className="flex gap-2">
                <SubmitButton>Save property</SubmitButton>
                <Link href="/properties">
                  <Button type="button" variant="secondary">Cancel</Button>
                </Link>
              </div>
            </div>
          </form>
        </DetailSection>
      ) : null}

      {user.role === "ADMIN" ? (
        <DetailSection title="Manager assignments" description="Compact admin controls for property manager coverage.">
          <DataTable columns={["Property", "Current manager", "Assign"]} minWidth="48rem">
            {rows.map((row) => (
              <tr key={row.property.id} className="table-row">
                <td className="table-cell font-semibold">{row.property.name}</td>
                <td className="table-cell text-[var(--muted)]">
                  {row.property.managerId
                    ? `${portal.managers.find((manager) => manager.id === row.property.managerId)?.firstName ?? "Assigned"} ${portal.managers.find((manager) => manager.id === row.property.managerId)?.lastName ?? ""}`.trim()
                    : "Unassigned"}
                </td>
                <td className="table-cell">
                  <form action={assignPropertyManagerAction} className="flex gap-2">
                    <input type="hidden" name="propertyId" value={row.property.id} />
                    <select name="managerId" defaultValue={row.property.managerId ?? ""} className="field h-10 min-w-56 py-0 text-sm">
                      <option value="">Unassigned</option>
                      {portal.managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.firstName} {manager.lastName}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary">Assign</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </DataTable>
        </DetailSection>
      ) : null}
    </div>
  );
}
