import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { RowActionLink, RowActionsMenu } from "@/components/row-actions-menu";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import {
  applicationStatusLabels,
  feeStatusLabel,
  getApplicationLocationLabel,
  managerOwnsApplication,
  primaryApplicant,
  publicApplicationPath
} from "@/lib/applications";
import { requireRoles } from "@/lib/auth";
import { readStore, UserRole } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";

function sortHref(params: Record<string, string>, sort: string) {
  const next = new URLSearchParams();
  for (const key of ["q", "status", "fee"]) {
    if (params[key]) next.set(key, params[key]);
  }
  next.set("sort", sort);
  return `/applications?${next.toString()}`;
}

export default async function ApplicationsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.MANAGER]);
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const statusFilter = params.status ?? "all";
  const feeFilter = params.fee ?? "all";
  const sort = params.sort ?? "submitted";
  const store = await readStore();
  const applications = store.rentalApplications
    .filter((application) => managerOwnsApplication(store, user, application))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = applications.flatMap((application) => {
    const submissions = store.applicationSubmissions
      .filter((submission) => submission.applicationId === application.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    if (!submissions.length) {
      return [{ application, submission: null, applicant: null }];
    }

    return submissions.map((submission) => {
      const applicants = store.applicationApplicants.filter((applicant) => applicant.submissionId === submission.id);
      return { application, submission, applicant: primaryApplicant(applicants) };
    });
  });

  const filtered = rows
    .filter((row) => {
      const applicantName = row.applicant ? `${row.applicant.firstName} ${row.applicant.lastName}` : "";
      const text = `${applicantName} ${row.application.title} ${getApplicationLocationLabel(store, row.application)}`.toLowerCase();
      const rowStatus = row.submission?.status ?? row.application.status;
      if (query && !text.includes(query)) return false;
      if (statusFilter !== "all" && rowStatus !== statusFilter) return false;
      if (feeFilter !== "all" && row.submission?.feeStatus !== feeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "applicant") {
        const aName = a.applicant ? `${a.applicant.lastName} ${a.applicant.firstName}` : "";
        const bName = b.applicant ? `${b.applicant.lastName} ${b.applicant.firstName}` : "";
        return aName.localeCompare(bName);
      }
      if (sort === "status") return String(a.submission?.status ?? a.application.status).localeCompare(String(b.submission?.status ?? b.application.status));
      if (sort === "rent") return b.application.monthlyRent - a.application.monthlyRent;
      return String(b.submission?.submittedAt ?? b.application.updatedAt).localeCompare(String(a.submission?.submittedAt ?? a.application.updatedAt));
    });

  const submittedCount = rows.filter((row) => row.submission?.status === "SUBMITTED").length;
  const reviewCount = rows.filter((row) => row.submission?.status === "UNDER_REVIEW").length;
  const approvedCount = rows.filter((row) => row.submission?.status === "APPROVED").length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Leasing pipeline"
        title="Applications"
        description="A table-first applicant pipeline for published links, new submissions, screening status, fee status, and move-in conversion."
        actions={
          <Link href="/applications/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        }
      />

      <section className="ops-grid">
        <StatCard label="Application links" value={String(applications.length)} detail={`${filtered.length} rows shown`} tone="brand" />
        <StatCard label="Submitted" value={String(submittedCount)} detail="Awaiting first review" tone={submittedCount ? "warning" : "default"} />
        <StatCard label="Under review" value={String(reviewCount)} detail="Screening in progress" tone={reviewCount ? "warning" : "default"} />
        <StatCard label="Approved" value={String(approvedCount)} detail="Ready for move-in" tone="success" />
      </section>

      <DetailSection title="Application register" description="Search, filter, and act on applicant submissions without opening every application card.">
        <FilterBar
          action="/applications"
          query={params.q}
          queryPlaceholder="Search applicant, application, property, or unit"
          hidden={{ sort }}
          filters={[
            {
              name: "status",
              label: "Status",
              value: statusFilter,
              options: [
                { label: "All statuses", value: "all" },
                { label: "Draft", value: "DRAFT" },
                { label: "Published", value: "PUBLISHED" },
                { label: "Submitted", value: "SUBMITTED" },
                { label: "Under review", value: "UNDER_REVIEW" },
                { label: "Approved", value: "APPROVED" },
                { label: "Rejected", value: "REJECTED" },
                { label: "Converted", value: "CONVERTED_TO_LEASE" }
              ]
            },
            {
              name: "fee",
              label: "Fee",
              value: feeFilter,
              options: [
                { label: "All fee states", value: "all" },
                { label: "Not required", value: "NOT_REQUIRED" },
                { label: "Unpaid", value: "UNPAID" },
                { label: "Paid", value: "PAID" },
                { label: "Waived", value: "WAIVED" }
              ]
            }
          ]}
        />

        {filtered.length ? (
          <DataTable
            className="mt-4"
            minWidth="68rem"
            columns={[
              <Link key="applicant" href={sortHref(params, "applicant")} className="sort-link">Applicant</Link>,
              "Property / unit",
              "Application",
              <Link key="status" href={sortHref(params, "status")} className="sort-link">Status</Link>,
              <Link key="submitted" href={sortHref(params, "submitted")} className="sort-link">Date submitted</Link>,
              "Screening",
              "Fee",
              <Link key="rent" href={sortHref(params, "rent")} className="sort-link">Rent</Link>,
              ""
            ]}
          >
            {filtered.map((row) => {
              const rowStatus = row.submission?.status ?? row.application.status;
              const href = row.submission ? `/applications/${row.application.id}/submissions/${row.submission.id}` : `/applications/${row.application.id}`;
              const sharePath = publicApplicationPath(row.application);

              return (
                <tr key={`${row.application.id}-${row.submission?.id ?? "listing"}`} className="table-row">
                  <td className="table-cell">
                    <Link href={href} className="table-link font-semibold">
                      {row.applicant ? `${row.applicant.firstName} ${row.applicant.lastName}` : "No submissions"}
                      {row.applicant?.email ? <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">{row.applicant.email}</span> : null}
                    </Link>
                  </td>
                  <td className="table-cell text-[var(--muted)]">{getApplicationLocationLabel(store, row.application)}</td>
                  <td className="table-cell">
                    <Link href={`/applications/${row.application.id}`} className="table-link font-medium">{row.application.title}</Link>
                  </td>
                  <td className="table-cell"><StatusBadge status={rowStatus} /></td>
                  <td className="table-cell text-[var(--muted)]">{row.submission ? formatDate(row.submission.submittedAt) : "No submissions"}</td>
                  <td className="table-cell text-[var(--muted)]">
                    {row.submission ? applicationStatusLabels[row.submission.status] : applicationStatusLabels[row.application.status]}
                  </td>
                  <td className="table-cell">{row.submission ? <StatusBadge status={feeStatusLabel(row.submission.feeStatus)} tone={row.submission.feeStatus === "PAID" || row.submission.feeStatus === "WAIVED" || row.submission.feeStatus === "NOT_REQUIRED" ? "success" : "warning"} /> : <StatusBadge status={row.application.applicationFee > 0 ? "Unpaid" : "No fee"} />}</td>
                  <td className="table-cell font-semibold">{formatCurrency(row.application.monthlyRent)}</td>
                  <td className="table-cell text-right">
                    <RowActionsMenu>
                      <RowActionLink href={href}>View</RowActionLink>
                      <RowActionLink href={`/applications/${row.application.id}`}>Manage application</RowActionLink>
                      <RowActionLink href={sharePath}>Open public link</RowActionLink>
                      {row.submission?.status === "APPROVED" ? <RowActionLink href={`/move-ins/new?applicationId=${row.application.id}`}>Start move-in</RowActionLink> : null}
                    </RowActionsMenu>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <div className="mt-4">
            <EmptyState icon={ClipboardList} title="No applications match" description="Adjust filters or create a public application link for an available unit." />
          </div>
        )}
      </DetailSection>
    </div>
  );
}
