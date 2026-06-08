import { ApplicantScreeningPanel } from "@/components/screening/applicant-screening-panel";
import { requireApplicantScreeningAccess } from "@/lib/screening/applicant-access";
import { readStore } from "@/lib/store";
import { getScreeningSummary } from "@/lib/screening/service";

export default async function ApplicantScreeningPage({
  params
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const application = await requireApplicantScreeningAccess(applicationId);
  const [summary, store] = await Promise.all([
    getScreeningSummary(application.id),
    readStore()
  ]);
  const property = store.properties.find((item) => item.id === application.propertyId);
  const unit = store.units.find((item) => item.id === application.unitId);
  const propertyLabel = [property?.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : ""].filter(Boolean).join(" - ")
    || String(application.metadata.applicationTitle ?? "Rental application");

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <ApplicantScreeningPanel
          applicationId={application.id}
          applicantName={application.applicantFirstName}
          propertyLabel={propertyLabel}
          initialStatus={{
            requests: summary.requests.map((request) => ({
              provider: request.provider,
              status: request.status,
              updatedAt: request.updatedAt
            })),
            plaid: summary.plaid
              ? {
                  status: summary.plaid.status,
                  identityVerified: summary.plaid.identityVerified,
                  incomeVerified: Boolean(summary.plaid.verifiedMonthlyIncome)
                }
              : null
          }}
        />
      </div>
    </main>
  );
}
