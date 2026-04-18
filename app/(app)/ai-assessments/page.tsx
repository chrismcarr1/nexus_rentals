import { MultiUploadInput } from "@/components/upload-inputs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createDamageAssessmentAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function AiAssessmentsPage() {
  const user = await requireUser();
  const [assessments, units, leases] = await Promise.all([
    db.damageAssessment.findMany({
      where: { inspection: { unit: { property: { organizationId: user.organizationId } } } },
      include: {
        inspection: { include: { unit: { include: { property: true } }, lease: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.unit.findMany({ where: { property: { organizationId: user.organizationId } }, include: { property: true } }),
    db.lease.findMany({ where: { unit: { property: { organizationId: user.organizationId } } }, include: { unit: true } })
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Damage Estimation Engine</p>
          <h1 className="mt-2 text-3xl font-semibold">AI-assisted turnover and damage review</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            Upload move-out photos, optionally include move-in baseline photos, and the local AI service will return a severity classification, repair cost range, confidence score, and recommended next actions. Estimates are approximate and not legal or insurance-grade valuations.
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-400">Assessment History</p>
          <div className="mt-5 space-y-3">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="rounded-[24px] border border-[var(--line)] bg-white/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{assessment.inspection.unit.property.name} {assessment.inspection.unit.unitNumber}</p>
                    <p className="text-sm text-stone-500">{formatDate(assessment.inspection.inspectionDate)}</p>
                  </div>
                  <Badge tone={assessment.severity === "LOW" ? "success" : assessment.severity === "CRITICAL" ? "danger" : "warning"}>{assessment.severity}</Badge>
                </div>
                <p className="mt-3 text-sm text-stone-600">{assessment.summary}</p>
                <p className="mt-4 text-lg font-semibold">{formatCurrency(assessment.estimatedLow)} - {formatCurrency(assessment.estimatedHigh)}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
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
            ))}
          </div>
        </Card>
      </div>
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--brand)]">Run New Assessment</p>
        <form action={createDamageAssessmentAction} className="mt-6 space-y-4">
          <select name="unitId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.property.name} {unit.unitNumber}</option>)}
          </select>
          <select name="leaseId" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <option value="">No linked lease</option>
            {leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.unit.unitNumber} lease</option>)}
          </select>
          <input name="inspectionDate" type="date" className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3" />
          <textarea
            name="notes"
            placeholder="Inspection notes, observed damage, or context"
            className="min-h-28 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3"
          />
          <MultiUploadInput name="imagePaths" label="Upload damage or move-out photos" />
          <MultiUploadInput name="baselinePaths" label="Upload optional move-in baseline photos" />
          <SubmitButton pendingLabel="Generating estimate...">Generate assessment</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
