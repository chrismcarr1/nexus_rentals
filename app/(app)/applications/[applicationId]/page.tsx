import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText, Send, UserRound } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateRentalApplicationPublicationAction } from "@/lib/actions";
import { applicationStatusLabels, applicationStatusTone, feeStatusLabel, getApplicationAddressLabel, getApplicationBundle, getApplicationLocationLabel, managerOwnsApplication, primaryApplicant, publicApplicationPath } from "@/lib/applications";
import { requireRoles } from "@/lib/auth";
import { readStore, UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function ApplicationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ applicationId: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const { applicationId } = await params;
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const bundle = getApplicationBundle(store, applicationId);

  if (!bundle || !managerOwnsApplication(store, user, bundle.application)) notFound();

  const { application, questions, requiredDocuments, submissions } = bundle;
  const sharePath = publicApplicationPath(application);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Application detail"
        title={application.title}
        description={`${getApplicationLocationLabel(store, application)} - ${getApplicationAddressLabel(store, application)}`}
        actions={
          <Link href="/applications" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
            Back
          </Link>
        }
      />

      {query.created ? <div className="page-alert page-alert-success">Application created successfully.</div> : null}
      {query.updated ? <div className="page-alert page-alert-success">Application updated.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.55fr)]">
        <Card className="p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={applicationStatusTone(application.status)}>{applicationStatusLabels[application.status]}</Badge>
                {application.applicationFee > 0 ? <Badge tone="warning">{formatCurrency(application.applicationFee)} fee</Badge> : <Badge>No fee</Badge>}
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[var(--text)]">Listing and terms</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Available {formatDate(application.availableMoveInDate)} with {formatCurrency(application.securityDeposit)} deposit.</p>
            </div>
            <form action={updateRentalApplicationPublicationAction}>
              <input type="hidden" name="applicationId" value={application.id} />
              <SubmitButton pendingLabel="Updating..." variant={application.status === "PUBLISHED" ? "secondary" : "primary"}>
                <Send className="h-4 w-4" />
                <span>{application.status === "PUBLISHED" ? "Unpublish" : "Publish"}</span>
              </SubmitButton>
              <input type="hidden" name="intent" value={application.status === "PUBLISHED" ? "draft" : "publish"} />
            </form>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel-muted p-4"><p className="text-sm text-[var(--muted)]">Rent</p><p className="mt-2 font-semibold">{formatCurrency(application.monthlyRent)}</p></div>
            <div className="panel-muted p-4"><p className="text-sm text-[var(--muted)]">Deposit</p><p className="mt-2 font-semibold">{formatCurrency(application.securityDeposit)}</p></div>
            <div className="panel-muted p-4"><p className="text-sm text-[var(--muted)]">Submissions</p><p className="mt-2 font-semibold">{submissions.length}</p></div>
            <div className="panel-muted p-4"><p className="text-sm text-[var(--muted)]">Published</p><p className="mt-2 font-semibold">{application.publishedAt ? formatDate(application.publishedAt) : "Not yet"}</p></div>
          </div>
          {application.status === "PUBLISHED" ? (
            <a href={sharePath} target="_blank" rel="noreferrer" className="mt-5 inline-flex max-w-full items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--surface)]">
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="truncate">{sharePath}</span>
            </a>
          ) : null}
        </Card>

        <Card className="p-5 lg:p-6">
          <p className="section-kicker">Requirements</p>
          <h2 className="mt-2 text-xl font-semibold">Documents and questions</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Documents</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {requiredDocuments.length ? requiredDocuments.map((document) => <Badge key={document.id} tone="warning">{document.label}</Badge>) : <Badge>None</Badge>}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Questions</p>
              <div className="mt-2 space-y-2">
                {questions.length ? questions.map((question) => <p key={question.id} className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{question.prompt}</p>) : <p className="text-sm text-[var(--muted)]">No custom screening questions.</p>}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] p-5">
          <p className="section-kicker">Review queue</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Submissions</h2>
        </div>
        {submissions.length ? (
          <div className="divide-y divide-[var(--line)]">
            {submissions.map((submission) => {
              const applicants = store.applicationApplicants.filter((applicant) => applicant.submissionId === submission.id);
              const applicant = primaryApplicant(applicants);
              return (
                <Link key={submission.id} href={`/applications/${application.id}/submissions/${submission.id}`} className="flex flex-col gap-3 bg-white p-4 transition hover:bg-[var(--surface)] md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-[var(--text)]"><UserRound className="h-4 w-4 text-[var(--brand)]" />{applicant ? `${applicant.firstName} ${applicant.lastName}` : "Applicant"}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">Submitted {formatDate(submission.submittedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={applicationStatusTone(submission.status)}>{applicationStatusLabels[submission.status]}</Badge>
                    <Badge>{feeStatusLabel(submission.feeStatus)}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState title="No submissions yet" description="Published application links will collect applicant submissions here." />
          </div>
        )}
      </Card>
    </div>
  );
}
