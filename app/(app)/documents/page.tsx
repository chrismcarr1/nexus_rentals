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
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { UserRole } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function humanizeKind(value: string) {
  return value
    .split("_")
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export default async function DocumentsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const kindFilter = params.kind ?? "all";
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
      return { file, property, unit };
    })
    .sort((a, b) => b.file.createdAt.localeCompare(a.file.createdAt));

  const kinds = Array.from(new Set(rows.map((row) => row.file.kind))).sort();
  const filtered = rows.filter((row) => {
    const text = `${row.file.label ?? ""} ${row.file.kind} ${row.file.path} ${row.property?.name ?? ""} ${row.unit?.unitNumber ?? ""}`.toLowerCase();
    if (query && !text.includes(query)) return false;
    if (kindFilter !== "all" && row.file.kind !== kindFilter) return false;
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

      <DetailSection title="Document register" description="Search and filter files by kind, property, unit, or source path.">
        <FilterBar
          action="/documents"
          query={params.q}
          queryPlaceholder="Search label, kind, property, unit, or path"
          filters={[
            {
              name: "kind",
              label: "Kind",
              value: kindFilter,
              options: [
                { label: "All file kinds", value: "all" },
                ...kinds.map((kind) => ({ label: humanizeKind(kind), value: kind }))
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
          <DataTable className="mt-4" minWidth="60rem" columns={["File", "Attachment", "Kind", "Created", "Path", ""]}>
            {filtered.map((row) => (
              <tr key={row.file.id} className="table-row">
                <td className="table-cell font-semibold">{row.file.label || humanizeKind(row.file.kind)}</td>
                <td className="table-cell text-[var(--muted)]">
                  {row.property?.name ?? "Unattached"}
                  {row.unit ? <span className="block text-xs">Unit {row.unit.unitNumber}</span> : null}
                </td>
                <td className="table-cell"><StatusBadge status={humanizeKind(row.file.kind)} /></td>
                <td className="table-cell text-[var(--muted)]">{formatDate(row.file.createdAt)}</td>
                <td className="table-cell max-w-96 truncate font-mono text-xs text-[var(--muted)]">{row.file.path}</td>
                <td className="table-cell text-right">
                  <RowActionsMenu>
                    <RowActionLink href={row.file.path}>Open file</RowActionLink>
                    {row.property ? <RowActionLink href={`/properties/${row.property.id}`}>View property</RowActionLink> : null}
                    {row.unit ? <RowActionLink href={`/units/${row.unit.id}`}>View unit</RowActionLink> : null}
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
