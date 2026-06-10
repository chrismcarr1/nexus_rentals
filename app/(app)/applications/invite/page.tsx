import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { ApplicationInviteForm, type InvitePropertyOption } from "@/components/application-invite-form";
import { PageHeader } from "@/components/page-header";
import { requireRoles } from "@/lib/auth";
import { getEmailDiagnostics } from "@/lib/email";
import { getScreeningDiagnostics } from "@/lib/screening/config";
import { readStore, UserRole } from "@/lib/store";

export default async function SendApplicationInvitePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const query = (await searchParams) ?? {};
  const store = await readStore();
  const emailDiagnostics = getEmailDiagnostics();
  const screening = getScreeningDiagnostics();
  const checkrConfigured = screening.checkr.mock || (screening.checkr.apiKeyPresent && screening.checkr.packagePresent);
  const plaidConfigured = screening.plaid.mock || (screening.plaid.clientIdPresent && screening.plaid.secretPresent);

  const properties: InvitePropertyOption[] = store.properties
    .filter((property) => property.organizationId === user.organizationId && property.managerId === user.id && property.status === "ACTIVE")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((property) => ({
      id: property.id,
      name: property.name,
      units: store.units
        .filter((unit) => unit.propertyId === property.id)
        .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }))
        .map((unit) => ({ id: unit.id, label: `Unit ${unit.unitNumber}${unit.nickname ? ` - ${unit.nickname}` : ""}` }))
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Leasing pipeline"
        title="Send application"
        description="Invite an applicant by email. Nexus sends a secure application link and tracks screening from one place."
        actions={
          <Link href="/applications" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)]">
            Back to applications
          </Link>
        }
      />

      {query.error ? <div className="page-alert page-alert-error">{query.error}</div> : null}

      {!emailDiagnostics.configured ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-600/18 bg-amber-500/12 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Cloudflare email is not fully configured, so the invite email cannot be delivered yet.{" "}
            {emailDiagnostics.issues.join(" ")}
          </span>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-3xl">
        <ApplicationInviteForm
          properties={properties}
          prefill={{
            firstName: query.firstName,
            lastName: query.lastName,
            email: query.email,
            phone: query.phone,
            propertyId: query.propertyId,
            unitId: query.unitId,
            desiredMoveInDate: query.desiredMoveInDate,
            requestBackgroundCheck: query.requestBackgroundCheck === "true",
            requestIncomeVerification: query.requestIncomeVerification === "true",
            note: query.note
          }}
          checkrConfigured={checkrConfigured}
          plaidConfigured={plaidConfigured}
        />
      </div>
    </div>
  );
}
