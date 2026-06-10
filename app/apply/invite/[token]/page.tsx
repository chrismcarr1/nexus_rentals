import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardList, Landmark, ShieldCheck } from "lucide-react";

import {
  RentalApplicationPublicForm,
  type PublicApplicationInvitePayload,
  type PublicApplicationPayload
} from "@/components/rental-application-public-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getApplicationAddressLabel, getApplicationLocationLabel } from "@/lib/applications";
import { hashInviteToken } from "@/lib/lease-connections";
import { readStore } from "@/lib/store";

function RequirementRow({
  icon: Icon,
  label,
  description,
  status,
  tone
}: {
  icon: typeof ClipboardList;
  label: string;
  description: string;
  status: string;
  tone: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[var(--line)] bg-white p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        </div>
      </div>
      <Badge tone={tone}>{status}</Badge>
    </div>
  );
}

export default async function InvitedApplicationPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const invite = store.applicationInvites.find((item) => item.tokenHash === hashInviteToken(decodeURIComponent(token)));

  if (!invite || invite.status === "REVOKED") notFound();

  const application = store.rentalApplications.find((item) => item.id === invite.applicationId);
  if (!application) notFound();

  const manager = store.users.find((item) => item.id === invite.managerUserId);
  const organization = store.organizations.find((item) => item.id === invite.organizationId);
  const submitted = query.submitted === "1" || invite.status === "SUBMITTED";
  const expired = !submitted && new Date(invite.expiresAt).getTime() < Date.now();

  const invitePayload: PublicApplicationInvitePayload = {
    token: decodeURIComponent(token),
    firstName: invite.applicantFirstName,
    lastName: invite.applicantLastName,
    email: invite.applicantEmail,
    phone: invite.applicantPhone,
    managerName: manager ? `${manager.firstName} ${manager.lastName}`.trim() : "Your property manager",
    organizationName: organization?.name ?? "Nexus Rentals",
    note: invite.note,
    requestBackgroundCheck: invite.requestBackgroundCheck,
    requestIncomeVerification: invite.requestIncomeVerification
  };

  const payload: PublicApplicationPayload = {
    publicSlug: application.publicSlug,
    title: application.title,
    location: getApplicationLocationLabel(store, application),
    address: getApplicationAddressLabel(store, application),
    monthlyRent: application.monthlyRent,
    securityDeposit: application.securityDeposit,
    availableMoveInDate: invite.desiredMoveInDate ?? application.availableMoveInDate,
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
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Application invitation</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            {invitePayload.managerName} at {invitePayload.organizationName} invited you to apply
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{payload.location} - {payload.address}</p>
          {invite.note ? (
            <p className="mt-3 rounded-md border-l-2 border-[var(--brand)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
              &ldquo;{invite.note}&rdquo;
            </p>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <RequirementRow
              icon={ClipboardList}
              label="Rental application"
              description="Personal, residence, employment, and reference details."
              status={submitted ? "Submitted" : "Required"}
              tone={submitted ? "success" : "warning"}
            />
            {invite.requestBackgroundCheck ? (
              <RequirementRow
                icon={ShieldCheck}
                label="Background check"
                description="Completed through Checkr after you submit and consent."
                status={submitted ? "See screening portal" : "After submission"}
                tone={submitted ? "warning" : "default"}
              />
            ) : null}
            {invite.requestIncomeVerification ? (
              <RequirementRow
                icon={Landmark}
                label="Bank / income verification"
                description="Connect a bank through Plaid. Credentials are never shared."
                status={submitted ? "See screening portal" : "After submission"}
                tone={submitted ? "warning" : "default"}
              />
            ) : null}
          </div>
        </Card>

        {expired ? (
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-semibold text-[var(--text)]">This invitation has expired</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Ask {invitePayload.managerName} to send a new application invite to {invite.applicantEmail}.
            </p>
          </Card>
        ) : submitted && query.submitted !== "1" ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h2 className="mt-4 text-2xl font-semibold text-[var(--text)]">Application already submitted</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Your application is with the property manager. Use the screening portal link from your email to check background check and bank verification status.
            </p>
          </Card>
        ) : (
          <RentalApplicationPublicForm
            application={payload}
            invite={invitePayload}
            submitted={query.submitted === "1"}
            error={query.error}
          />
        )}
      </div>
    </main>
  );
}
