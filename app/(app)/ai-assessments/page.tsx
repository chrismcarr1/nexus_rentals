import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { MultiUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createDamageAssessmentAction } from "@/lib/actions";
import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export default async function AiAssessmentsPage() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const portal = await getPortalContext(user);
  const assessments = [...portal.scope.assessments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Damage estimation"
        title="Move-out photo review tied to inspections and unit records."
        description="Upload inspection photos, optionally add baseline images, and generate a structured local estimate with severity, confidence, categories, cost range, and recommended next steps."
      />
      <div className="content-split">
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Assessment history</p>
            <div className="mt-5 space-y-3">
              {assessments.length === 0 ? (
                <EmptyState title="No assessments yet" description="Generated damage estimates will appear here with their linked unit and inspection context." />
              ) : null}
              {assessments.map((assessment) => {
                const inspection = portal.scope.inspections.find((item) => item.id === assessment.inspectionId);
                const unit = inspection ? portal.scope.units.find((item) => item.id === inspection.unitId) : null;
                const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;

                return (
                  <div key={assessment.id} className="panel-muted p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {property?.name ?? "Property"} {unit?.unitNumber ?? ""}
                        </p>
                        <p className="text-sm text-stone-500">{inspection?.inspectionDate ? formatDate(inspection.inspectionDate) : formatDate(assessment.createdAt)}</p>
                      </div>
                      <Badge tone={assessment.severity === "LOW" ? "success" : assessment.severity === "CRITICAL" ? "danger" : "warning"}>{assessment.severity}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-stone-600">{assessment.summary}</p>
                    <p className="mt-4 text-lg font-semibold">
                      {formatCurrency(assessment.estimatedLow)} - {formatCurrency(assessment.estimatedHigh)}
                    </p>
                    <div className="form-grid-3 mt-3">
                      <div className="rounded-2xl bg-stone-900/5 px-3 py-2 text-sm">
                        <p className="text-stone-400">Confidence</p>
                        <p className="font-semibold">{Math.round(assessment.confidenceScore * 100)}%</p>
                      </div>
                      <div className="rounded-2xl bg-stone-900/5 px-3 py-2 text-sm">
                        <p className="text-stone-400">Categories</p>
                        <p className="font-semibold">{assessment.damageCategories}</p>
                      </div>
                      <div className="rounded-2xl bg-stone-900/5 px-3 py-2 text-sm">
                        <p className="text-stone-400">Next steps</p>
                        <p className="font-semibold">{assessment.recommendedNext}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Run new assessment</p>
          {portal.scope.units.length === 0 ? (
            <div className="mt-6">
              <EmptyState title="No units available" description="Create or assign a property and unit before running a damage assessment." />
            </div>
          ) : (
            <form action={createDamageAssessmentAction} className="mt-6 space-y-4">
              <select name="unitId" className="field">
                {portal.scope.units.map((unit) => {
                  const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                  return (
                    <option key={unit.id} value={unit.id}>
                      {property?.name} {unit.unitNumber}
                    </option>
                  );
                })}
              </select>
              <select name="leaseId" className="field">
                <option value="">No linked lease</option>
                {portal.scope.leases.map((lease) => {
                  const unit = portal.scope.units.find((item) => item.id === lease.unitId);
                  return (
                    <option key={lease.id} value={lease.id}>
                      {unit?.unitNumber} lease
                    </option>
                  );
                })}
              </select>
              <input name="inspectionDate" type="date" className="field" />
              <textarea name="notes" placeholder="Inspection notes, observed damage, or context" className="field min-h-28" />
              <MultiUploadInput name="imagePaths" label="Upload damage or move-out photos" />
              <MultiUploadInput name="baselinePaths" label="Upload optional move-in baseline photos" />
              <SubmitButton pendingLabel="Generating estimate...">Generate assessment</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
