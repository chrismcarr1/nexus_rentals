import { notFound } from "next/navigation";

import { RentalApplicationPublicForm, type PublicApplicationPayload } from "@/components/rental-application-public-form";
import { getApplicationAddressLabel, getApplicationLocationLabel } from "@/lib/applications";
import { readStore } from "@/lib/store";

export default async function PublicApplicationPage({
  params,
  searchParams
}: {
  params: Promise<{ publicSlug: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { publicSlug } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const application = store.rentalApplications.find((item) => item.publicSlug === publicSlug);

  if (!application) notFound();
  if (application.status !== "PUBLISHED" && query.submitted !== "1") notFound();

  const payload: PublicApplicationPayload = {
    publicSlug: application.publicSlug,
    title: application.title,
    location: getApplicationLocationLabel(store, application),
    address: getApplicationAddressLabel(store, application),
    monthlyRent: application.monthlyRent,
    securityDeposit: application.securityDeposit,
    availableMoveInDate: application.availableMoveInDate,
    applicationFee: application.applicationFee,
    requiredFields: application.requiredFields,
    allowCoApplicants: application.allowCoApplicants,
    allowPets: application.allowPets,
    questions: store.applicationQuestions
      .filter((question) => question.applicationId === application.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => ({ id: question.id, prompt: question.prompt, required: question.required })),
    requiredDocuments: store.applicationDocuments
      .filter((document) => document.applicationId === application.id && !document.submissionId)
      .map((document) => ({ id: document.id, label: document.label, required: document.required }))
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <RentalApplicationPublicForm
          application={payload}
          submitted={query.submitted === "1"}
          error={query.error}
        />
      </div>
    </main>
  );
}
