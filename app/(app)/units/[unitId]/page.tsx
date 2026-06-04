import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";

import { SingleUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { addUnitAssetAction } from "@/lib/actions";
import { formatUnitAddress } from "@/lib/address";
import { requireRouteAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowedStoredAssetPath } from "@/lib/file-security";
import { formatCurrency, formatDate, parseTags } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

function formatDateOrUnset(value?: string | Date | null) {
  return value ? formatDate(value) : "Not set";
}

export default async function UnitDetailPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
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
  const unitFiles = unit.files.filter((file) => isAllowedStoredAssetPath(file.path, { allowDemo: true }));
  const canStartMoveIn =
    user.role === "MANAGER" &&
    unit.property.managerId === user.id &&
    ["VACANT", "TURNOVER"].includes(unit.occupancyStatus) &&
    !unit.leases.some((lease) => ["ACTIVE", "UPCOMING", "active", "invited", "draft"].includes(lease.status));

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Unit detail</p>
            <h1 className="page-title mt-3 font-[var(--font-display)]">
              {unit.property.name} <span className="text-[var(--brand)]">{unit.unitNumber}</span>
            </h1>
            <p className="mt-3 text-sm text-stone-600">{formatUnitAddress(unit.property, unit)}</p>
            <p className="mt-4 text-sm text-stone-600">{unit.nickname || unit.unitType} - {unit.bedrooms} bd / {unit.bathrooms} ba / {unit.squareFeet ?? "n/a"} sf</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {parseTags(unit.amenities).map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
          </div>
          <div className="panel-muted p-5">
            <p className="text-3xl font-semibold">{formatCurrency(unit.monthlyRent)}/mo</p>
            <p className="mt-2 text-sm text-stone-500">Deposit {formatCurrency(unit.depositAmount)}</p>
            <div className="mt-4 flex gap-2">
              <Badge tone={unit.occupancyStatus === "OCCUPIED" ? "success" : "warning"}>{unit.occupancyStatus}</Badge>
              <Badge>{unit.leaseStatus}</Badge>
            </div>
            {canStartMoveIn ? (
              <Link
                href={`/move-ins/new?propertyId=${encodeURIComponent(unit.propertyId)}&unitId=${encodeURIComponent(unit.id)}`}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
              >
                <Plus className="h-4 w-4" />
                New Move-In
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <section className="content-split-tight">
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Gallery</p>
          <div className="card-grid-compact mt-5">
            {unitFiles.map((file) => (
              <div key={file.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.path} alt={file.label ?? "Unit image"} className="h-40 w-full object-cover" />
                <div className="p-3 text-sm text-stone-500">{file.kind}</div>
              </div>
            ))}
          </div>
          <form action={addUnitAssetAction} className="mt-6 space-y-4">
            <input type="hidden" name="unitId" value={unit.id} />
            <input type="hidden" name="kind" value="UNIT_IMAGE" />
            <SingleUploadInput name="path" label="Upload new gallery image" />
            <SubmitButton>Add to gallery</SubmitButton>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Lease history</p>
            <div className="mt-5 space-y-3">
              {unit.leases.map((lease) => (
                <div key={lease.id} className="panel-muted p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{lease.tenants.map((row) => `${row.tenant.firstName} ${row.tenant.lastName}`).join(", ") || "Unassigned"}</p>
                      <p className="text-sm text-stone-500">{formatDateOrUnset(lease.startDate)} - {formatDateOrUnset(lease.endDate)}</p>
                    </div>
                    <Badge>{lease.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Financial activity</p>
            <div className="mt-5 space-y-3">
              {unit.payments.map((payment) => (
                <div key={payment.id} className="panel-muted p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{payment.description}</p>
                    <Badge tone={payment.status === "PAID" ? "success" : payment.status === "LATE" ? "danger" : "warning"}>{payment.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-stone-500">{formatDate(payment.dueDate)}</p>
                  <p className="mt-3 text-lg font-semibold">{formatCurrency(payment.amount)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
