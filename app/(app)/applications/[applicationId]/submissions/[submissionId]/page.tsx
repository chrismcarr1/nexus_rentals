import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, UserRound, XCircle } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ManagerScreeningDashboard } from "@/components/screening/manager-screening-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { addApplicationNoteAction, updateApplicationSubmissionStatusAction } from "@/lib/actions";
import { applicationStatusLabels, applicationStatusTone, feeStatusLabel, getApplicationAddressLabel, getSubmissionBundle, managerOwnsApplication, primaryApplicant } from "@/lib/applications";
import { requireRoles } from "@/lib/auth";
import { readStore, UserRole } from "@/lib/store";
import { getScreeningSummary } from "@/lib/screening/service";
import { formatCurrency, formatDate } from "@/lib/utils";

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--line)] bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--text)]">{value || "Not provided"}</p>
    </div>
  );
}

function StatusForm({
  applicationId,
  submissionId,
  status,
  children,
  variant = "secondary"
}: {
  applicationId: string;
  submissionId: string;
  status: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <form action={updateApplicationSubmissionStatusAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} pendingLabel="Updating...">{children}</SubmitButton>
    </form>
  );
}

export default async function ApplicationSubmissionPage({
  params,
  searchParams
}: {
  params: Promise<{ applicationId: string; submissionId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const { applicationId, submissionId } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const bundle = getSubmissionBundle(store, submissionId);

  if (!bundle || bundle.application.id !== applicationId || !managerOwnsApplication(store, user, bundle.application)) notFound();

  const { application, submission, applicants, documents, notes } = bundle;
  const screeningSummary = await getScreeningSummary(submission.id);
  const applicant = primaryApplicant(applicants);
  const coApplicants = applicants.filter((item) => item.type === "CO_APPLICANT");
  const canConvert = submission.status === "APPROVED";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Application review"
        title={applicant ? `${applicant.firstName} ${applicant.lastName}` : "Applicant"}
        description={`${application.title} - ${getApplicationAddressLabel(store, application)}`}
        actions={
          <Link href={`/applications/${application.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
            Back
          </Link>
        }
      />

      {query.updated ? <div className="rounded-md border border-emerald-600/15 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-800">Application review updated.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
        <div className="space-y-4">
          <Card className="p-5 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={applicationStatusTone(submission.status)}>{applicationStatusLabels[submission.status]}</Badge>
                  <Badge>{feeStatusLabel(submission.feeStatus)}</Badge>
                  {application.applicationFee > 0 ? <Badge tone="warning">{formatCurrency(application.applicationFee)} fee</Badge> : null}
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[var(--text)]">Applicant information</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">Submitted {formatDate(submission.submittedAt)}</p>
              </div>
              {canConvert ? (
                <Link
                  href={`/move-ins/new?applicationSubmissionId=${encodeURIComponent(submission.id)}`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
                >
                  Convert to Move-In
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailRow label="Name" value={applicant ? `${applicant.firstName} ${applicant.lastName}` : ""} />
              <DetailRow label="Email" value={applicant?.email} />
              <DetailRow label="Phone" value={applicant?.phone} />
              <DetailRow label="Date of birth" value={applicant?.dateOfBirth ? formatDate(applicant.dateOfBirth) : ""} />
              <DetailRow label="Monthly income" value={submission.monthlyIncome ? formatCurrency(submission.monthlyIncome) : ""} />
              <DetailRow label="Target rent" value={formatCurrency(application.monthlyRent)} />
            </div>
          </Card>

          <ManagerScreeningDashboard
            applicationId={submission.id}
            initialSummary={screeningSummary}
          />

          <Card className="p-5 lg:p-6">
            <p className="section-kicker">Application content</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Housing, employment, and references</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <DetailRow label="Current address" value={submission.currentAddress} />
              <DetailRow label="Employment" value={submission.employment} />
              <DetailRow label="Rental history" value={submission.rentalHistory} />
              <DetailRow label="References" value={submission.references} />
              <DetailRow label="Pets" value={submission.pets} />
              <DetailRow label="Vehicles" value={submission.vehicles} />
            </div>
          </Card>

          {coApplicants.length ? (
            <Card className="p-5 lg:p-6">
              <p className="section-kicker">Co-applicants</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {coApplicants.map((coApplicant) => (
                  <div key={coApplicant.id} className="rounded-md border border-[var(--line)] bg-white p-4">
                    <p className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-[var(--brand)]" />{coApplicant.firstName} {coApplicant.lastName}</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">{coApplicant.email}</p>
                    {coApplicant.phone ? <p className="mt-1 text-sm text-[var(--muted)]">{coApplicant.phone}</p> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-5 lg:p-6">
            <p className="section-kicker">Screening</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Answers and documents</h2>
            <div className="mt-5 space-y-3">
              {submission.answers.length ? submission.answers.map((answer) => (
                <div key={answer.questionId} className="rounded-md border border-[var(--line)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">{answer.prompt}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{answer.answer || "No answer"}</p>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No custom answers were collected.</p>}
              {documents.length ? (
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-[var(--brand)]" />Requested documents</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {documents.map((document) => <Badge key={document.id} tone={document.status === "RECEIVED" ? "success" : "warning"}>{document.label}</Badge>)}
                  </div>
                  {submission.documentNotes ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{submission.documentNotes}</p> : null}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="section-kicker">Decision</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Review actions</h2>
            <div className="mt-4 grid gap-2">
              <StatusForm applicationId={application.id} submissionId={submission.id} status="UNDER_REVIEW"><ClipboardList className="h-4 w-4" /> Mark under review</StatusForm>
              <StatusForm applicationId={application.id} submissionId={submission.id} status="APPROVED" variant="primary"><CheckCircle2 className="h-4 w-4" /> Approve</StatusForm>
              <StatusForm applicationId={application.id} submissionId={submission.id} status="REJECTED" variant="danger"><XCircle className="h-4 w-4" /> Reject</StatusForm>
            </div>
          </Card>

          <Card className="p-5">
            <p className="section-kicker">Internal notes</p>
            <form action={addApplicationNoteAction} className="mt-4 space-y-3">
              <input type="hidden" name="applicationId" value={application.id} />
              <input type="hidden" name="submissionId" value={submission.id} />
              <textarea name="body" required className="field min-h-28" placeholder="Add review note" />
              <SubmitButton pendingLabel="Saving note...">Add note</SubmitButton>
            </form>
            <div className="mt-5 space-y-3">
              {notes.length ? notes.map((note) => (
                <div key={note.id} className="rounded-md border border-[var(--line)] bg-white p-3">
                  <p className="text-sm leading-6 text-[var(--muted)]">{note.body}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{formatDate(note.createdAt)}</p>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No internal notes yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
