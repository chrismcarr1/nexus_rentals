import { FolderOpen } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { requireRoles } from "@/lib/auth";
import { documentDownloadHref, documentFilterGroup, documentTypeLabel, getFileDisplayName } from "@/lib/document-metadata";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { UserRole } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function DocumentsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const typeFilter = params.type ?? "all";
  const propertyFilter = params.propertyId ?? "all";

  const rows = portal.scope.files
    .filter((file) => isAllowedStoredAssetPath(file.path, { allowDemo: true }))
    .map((file) => {
      const unit = file.unitId ? portal.scope.units.find((item) => item.id === file.unitId) : null;
      const property = file.propertyId
        ? portal.scope.properties.find((item) => item.id === file.propertyId)
        : unit
          ? portal.scope.properties.find((item) => item.id === unit.propertyId)
          : null;
      const lease = file.leaseId ? portal.scope.leases.find((item) => item.id === file.leaseId) : null;
      const tenant = file.tenantId ? portal.scope.tenants.find((item) => item.id === file.tenantId) : null;
      const uploadedBy = file.uploadedById
        ? [...portal.users, ...portal.managers].find((item) => item.id === file.uploadedById)
        : null;
      return { file, property, unit, lease, tenant, uploadedBy };
    })
    .sort((a, b) => b.file.createdAt.localeCompare(a.file.createdAt));

  const filtered = rows.filter((row) => {
    const text = `${getFileDisplayName(row.file)} ${documentTypeLabel(row.file.kind)} ${row.property?.name ?? ""} ${row.unit?.unitNumber ?? ""} ${row.lease?.nexusLeaseId ?? ""} ${row.tenant?.firstName ?? ""} ${row.tenant?.lastName ?? ""}`.toLowerCase();
    if (query && !text.includes(query)) return false;
    if (typeFilter !== "all" && documentFilterGroup(row.file.kind) !== typeFilter) return false;
    if (propertyFilter !== "all" && row.property?.id !== propertyFilter) return false;
    return true;
  });

  const leaseDocs = rows.filter((row) => row.file.kind === "LEASE_DOCUMENT").length;
  const images = rows.filter((row) => row.file.kind.includes("IMAGE")).length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Document control"
        title="Documents"
        description="A clean register for lease files, property photos, unit assets, inspection media, and uploaded operational records."
      />

      <section className="ops-grid">
        <StatCard label="Files" value={String(rows.length)} detail={`${filtered.length} shown`} tone="brand" />
        <StatCard label="Lease documents" value={String(leaseDocs)} detail="Agreement and lease records" />
        <StatCard label="Images" value={String(images)} detail="Property, unit, and inspection media" />
        <StatCard label="Properties with files" value={String(new Set(rows.map((row) => row.property?.id).filter(Boolean)).size)} detail="Attached assets" />
      </section>

      <DetailSection title="Document register" description="Search and filter files by type, property, unit, lease, or tenant association.">
        <FilterBar
          action="/documents"
          query={params.q}
          queryPlaceholder="Search file name, type, property, unit, lease, or tenant"
          filters={[
            {
              name: "type",
              label: "Type",
              value: typeFilter,
              options: [
                { label: "All documents", value: "all" },
                { label: "Property images", value: "property-images" },
                { label: "Unit images", value: "unit-images" },
                { label: "Tenant IDs", value: "ids" },
                { label: "Leases", value: "leases" },
                { label: "Maintenance", value: "maintenance" },
                { label: "General", value: "general" }
              ]
            },
            {
              name: "propertyId",
              label: "Property",
              value: propertyFilter,
              options: [
                { label: "All properties", value: "all" },
                ...portal.scope.properties.map((property) => ({ label: property.name, value: property.id }))
              ]
            }
          ]}
        />

        {filtered.length ? (
          <DataTable className="mt-4" minWidth="58rem" columns={["File name", "Type", "Associated with", "Uploaded", "Uploaded by", ""]}>
            {filtered.map((row) => (
              <tr key={row.file.id} className="table-row">
                <td className="table-cell">
                  <span className="block font-semibold">{getFileDisplayName(row.file)}</span>
                  {row.file.originalFileName && row.file.originalFileName !== getFileDisplayName(row.file) ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{row.file.originalFileName}</span>
                  ) : null}
                </td>
                <td className="table-cell"><StatusBadge status={documentTypeLabel(row.file.kind)} /></td>
                <td className="table-cell text-[var(--muted)]">
                  {row.property?.name ?? "Unattached"}
                  {row.unit ? <span className="block text-xs">Unit {row.unit.unitNumber}</span> : null}
                  {row.lease ? <span className="block text-xs">Lease {row.lease.nexusLeaseId ?? row.lease.id}</span> : null}
                  {row.tenant ? <span className="block text-xs">{row.tenant.firstName} {row.tenant.lastName}</span> : null}
                </td>
                <td className="table-cell text-[var(--muted)]">{formatDate(row.file.uploadedAt ?? row.file.createdAt)}</td>
                <td className="table-cell text-[var(--muted)]">
                  {row.uploadedBy ? `${row.uploadedBy.firstName} ${row.uploadedBy.lastName}` : "Not recorded"}
                </td>
                <td className="table-cell text-right">
                  <RowActionsMenu>
                    <RowActionLink href={documentDownloadHref(row.file.id)}>Open file</RowActionLink>
                    {row.property ? <RowActionLink href={`/properties/${row.property.id}`}>View property</RowActionLink> : null}
                    {row.unit ? <RowActionLink href={`/units/${row.unit.id}`}>View unit</RowActionLink> : null}
                    {row.lease ? <RowActionLink href={`/leases/${row.lease.id}`}>View lease</RowActionLink> : null}
                  </RowActionsMenu>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <div className="mt-4">
            <EmptyState icon={FolderOpen} title="No documents match" description="Uploaded files from properties, units, leases, and inspections will appear here." />
          </div>
        )}
      </DetailSection>
    </div>
  );
}
