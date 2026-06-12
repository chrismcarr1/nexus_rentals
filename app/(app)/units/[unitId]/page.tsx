import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { NamedPhotoUpload } from "@/components/named-photo-upload";
import { PageHeader } from "@/components/page-header";
import { PhotoCarousel } from "@/components/photo-carousel";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { addUnitPhotosAction, deleteUnitPhotoAction, renameUnitPhotoAction } from "@/lib/actions";
import { formatUnitAddress } from "@/lib/address";
import { requireRouteAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileDisplayName, UNIT_PHOTO_LIMIT } from "@/lib/document-metadata";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { formatCurrency, formatDate, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | Date | null) {
  return value ? formatDate(value) : "Not set";
}

export default async function UnitDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ unitId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { unitId } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireRouteAccess("/units");
  const portal = await getPortalContext(user);
  const unit = await db.unit.findFirst({
    where: { id: unitId, property: { organizationId: user.organizationId } },
    include: {
      property: true,
      leases: { include: { tenants: { include: { tenant: true } } }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { dueDate: "desc" }, take: 8 },
      expenses: { orderBy: { incurredAt: "desc" }, take: 8 },
      maintenance: { orderBy: { requestedAt: "desc" }, take: 8 },
      inspections: { include: { assessments: true }, orderBy: { inspectionDate: "desc" } },
      files: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!unit || !portal.scope.units.some((item) => item.id === unit.id)) notFound();
  const unitFiles = unit.files
    .filter((file) => file.kind === "UNIT_IMAGE" && isAllowedStoredAssetPath(file.path, { allowDemo: true }))
    .slice(0, UNIT_PHOTO_LIMIT);
  const propertyFiles = portal.scope.files
    .filter(
      (file) =>
        file.propertyId === unit.propertyId &&
        !file.unitId &&
        file.kind === "PROPERTY_IMAGE" &&
        isAllowedStoredAssetPath(file.path, { allowDemo: true })
    )
    .slice(0, 20);
  const galleryFiles = unitFiles.length ? unitFiles : propertyFiles;
  const canStartMoveIn =
    user.role === "MANAGER" &&
    unit.property.managerId === user.id &&
    ["VACANT", "TURNOVER"].includes(unit.occupancyStatus) &&
    !unit.leases.some((lease) => ["ACTIVE", "UPCOMING", "active", "invited", "draft"].includes(lease.status));
  const activeLease = unit.leases.find((lease) => ["ACTIVE", "UPCOMING", "active", "upcoming"].includes(lease.status));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Unit detail"
        title={`${unit.property.name} / Unit ${unit.unitNumber}`}
        description={`${formatUnitAddress(unit.property, unit)} · ${unit.nickname || unit.unitType} · ${unit.bedrooms} bd / ${unit.bathrooms} ba / ${unit.squareFeet ?? "n/a"} sf`}
        actions={
          canStartMoveIn ? (
              <Link
                href={`/move-ins/new?propertyId=${encodeURIComponent(unit.propertyId)}&unitId=${encodeURIComponent(unit.id)}`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
              >
                <Plus className="h-4 w-4" />
                New Move-In
              </Link>
          ) : null
        }
      />

      <div className="ops-grid">
        <StatCard label="Monthly rent" value={formatCurrency(unit.monthlyRent)} detail={`Deposit ${formatCurrency(unit.depositAmount)}`} />
        <StatCard label="Occupancy" value={unit.occupancyStatus} detail={activeLease ? "Lease assigned" : "No active lease"} tone={unit.occupancyStatus === "OCCUPIED" ? "success" : "warning"} />
        <StatCard label="Lease status" value={unit.leaseStatus} detail={activeLease ? `Through ${formatDateOrUnset(activeLease.endDate)}` : "No current term"} />
        <StatCard label="Work orders" value={unit.maintenance.length} detail="Recent requests in view" tone={unit.maintenance.length ? "warning" : "success"} />
      </div>

      {parseTags(unit.amenities).length ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-4">
          {parseTags(unit.amenities).map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
      ) : null}

      <DetailSection
        id="photos"
        title="Unit gallery"
        description={
          unitFiles.length
            ? `${unitFiles.length} of ${UNIT_PHOTO_LIMIT} unit photos. Unit-specific photos are enabled.`
            : `Using ${propertyFiles.length} inherited property photo${propertyFiles.length === 1 ? "" : "s"}.`
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone={unitFiles.length ? "success" : "default"}>
            {unitFiles.length ? "Unit-specific photos enabled" : "Using property photos"}
          </Badge>
          <Badge>{unitFiles.length} of {UNIT_PHOTO_LIMIT} unit photos</Badge>
        </div>
        {query.error === "photo-limit" ? (
          <div className="page-alert page-alert-warning mb-4">
            This unit already has the maximum of {UNIT_PHOTO_LIMIT} unit photos. Delete one before adding another.
          </div>
        ) : null}
        {galleryFiles.length ? (
          <PhotoCarousel
            photos={galleryFiles}
            height="h-64"
            label={unitFiles.length ? "Unit-specific photos" : "Inherited property photos"}
          />
        ) : (
          <EmptyState title="No photos available" description="Upload unit photos or add property photos to provide an inherited gallery." />
        )}
        {unitFiles.length ? (
          <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2 xl:grid-cols-4">
            {unitFiles.map((file) => (
              <div key={file.id} className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
                <img src={file.path} alt={getFileDisplayName(file)} className="h-36 w-full object-cover" />
                <div className="space-y-3 p-3">
                  <form action={renameUnitPhotoAction} className="space-y-2">
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="fileId" value={file.id} />
                    <label className="block">
                      <span className="field-label">Photo name</span>
                      <input name="displayName" defaultValue={getFileDisplayName(file)} maxLength={120} className="field" />
                    </label>
                    <SubmitButton variant="secondary" className="w-full">Save name</SubmitButton>
                  </form>
                  <form action={deleteUnitPhotoAction}>
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="fileId" value={file.id} />
                    <SubmitButton variant="ghost" pendingLabel="Removing..." className="w-full text-[var(--danger)]">
                      <Trash2 className="h-4 w-4" />
                      Delete photo
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-5 border-t border-[var(--line)] pt-5">
          <form action={addUnitPhotosAction} className="space-y-4">
            <input type="hidden" name="unitId" value={unit.id} />
            <NamedPhotoUpload
              pathName="imagePaths"
              titleName="imageNames"
              originalNameName="imageOriginalNames"
              kind="unit"
              existingCount={unitFiles.length}
              limit={UNIT_PHOTO_LIMIT}
              label="Add unit photos"
            />
            <SubmitButton disabled={unitFiles.length >= UNIT_PHOTO_LIMIT}>Add to gallery</SubmitButton>
          </form>
        </div>
      </DetailSection>

      <DetailSection title="Lease history" description="Current and historical occupancy for this unit.">
        {unit.leases.length ? (
          <DataTable columns={["Tenant", "Term", "Monthly rent", "Status"]}>
            {unit.leases.map((lease) => (
              <tr key={lease.id} className="table-row">
                <td className="table-cell font-semibold text-[var(--text)]">{lease.tenants.map((row) => `${row.tenant.firstName} ${row.tenant.lastName}`).join(", ") || "Unassigned"}</td>
                <td className="table-cell text-[var(--muted)]">{formatDateOrUnset(lease.startDate)} - {formatDateOrUnset(lease.endDate)}</td>
                <td className="table-cell font-semibold">{formatCurrency(lease.monthlyRent)}</td>
                <td className="table-cell"><Badge>{lease.status}</Badge></td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No lease history" description="Lease records connected to this unit will appear here." />
        )}
      </DetailSection>

      <DetailSection title="Financial activity" description="Recent charges and collections assigned to this unit.">
        {unit.payments.length ? (
          <DataTable columns={["Description", "Tenant", "Due date", "Amount", "Status"]}>
            {unit.payments.map((payment) => (
              <tr key={payment.id} className="table-row">
                <td className="table-cell font-semibold text-[var(--text)]">{payment.description}</td>
                <td className="table-cell text-[var(--muted)]">{payment.tenant ? `${payment.tenant.firstName} ${payment.tenant.lastName}` : "Unassigned"}</td>
                <td className="table-cell text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                <td className="table-cell font-semibold">{formatCurrency(payment.amount)}</td>
                <td className="table-cell"><Badge tone={payment.status === "PAID" ? "success" : payment.status === "LATE" ? "danger" : "warning"}>{payment.status}</Badge></td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No financial activity" description="Charges and payments for this unit will appear here." />
        )}
      </DetailSection>
    </div>
  );
}
