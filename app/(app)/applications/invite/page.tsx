import Link from "next/link";
import { AlertTriangle, Building2 } from "lucide-react";

import { ApplicationInviteForm, type InvitePropertyOption } from "@/components/application-invite-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatAddress } from "@/lib/address";
import { getAppDateKey } from "@/lib/app-time";
import { requireRoles } from "@/lib/auth";
import { getEmailDiagnostics } from "@/lib/email";
import { getUnitAvailableStartDate, leaseBlocksNewMoveIn, normalizeLeaseLifecycleStatus } from "@/lib/lease-connections";
import { getScreeningDiagnostics } from "@/lib/screening/config";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

export default async function SendApplicationInvitePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const user = await requireRoles([UserRole.MANAGER]);
  const query = (await searchParams) ?? {};
  const portal = await getPortalContext(user);
  const emailDiagnostics = getEmailDiagnostics();
  const screening = getScreeningDiagnostics();
  const checkrConfigured = screening.checkr.mock || (screening.checkr.apiKeyPresent && screening.checkr.packagePresent);
  const plaidConfigured = screening.plaid.mock || (screening.plaid.clientIdPresent && screening.plaid.secretPresent);

  const todayKey = getAppDateKey();
  const properties: InvitePropertyOption[] = portal.scope.properties
    .filter((property) => property.status !== "ARCHIVED")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((property) => ({
      id: property.id,
      name: property.name,
      address: formatAddress(property),
      units: portal.scope.units
        .filter((unit) => unit.propertyId === property.id)
        .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }))
        .map((unit) => {
          const unitLeases = portal.scope.leases
            .filter((lease) => lease.unitId === unit.id)
            .map((lease) => ({
              id: lease.id,
              status: normalizeLeaseLifecycleStatus(lease, todayKey),
              endDate: lease.endDate,
              tenantIds: lease.tenantIds ?? []
            }));
          const blockingLeases = unitLeases.filter((lease) => leaseBlocksNewMoveIn(lease.status));
          const activeLease = blockingLeases.find((lease) => lease.status === "ACTIVE" || lease.status === "active");
          const upcomingLease = blockingLeases.find((lease) => lease.status === "UPCOMING");
          const displayLease = activeLease ?? upcomingLease ?? null;
          const tenant = displayLease?.tenantIds[0] ? portal.scope.tenants.find((item) => item.id === displayLease.tenantIds[0]) : null;
          const availableFrom = getUnitAvailableStartDate(unitLeases);

          return {
            id: unit.id,
            label: `Unit ${unit.unitNumber}${unit.nickname ? ` - ${unit.nickname}` : ""}`,
            leaseStatusLabel: activeLease ? "Active lease" : upcomingLease ? "Upcoming lease" : "No active lease",
            tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : null,
            leaseEndDate: displayLease?.endDate ?? null,
            availableFrom,
            availableNow: Boolean(availableFrom && availableFrom <= todayKey)
          };
        })
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

      {!properties.length ? (
        <EmptyState
          icon={Building2}
          title="Create a property before sending application invites"
          description="Application invites are tied to one of your properties. Add a property (and ideally a unit) first, then come back to invite an applicant."
          action={
            <Link href="/properties" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">
              <Building2 className="h-4 w-4" />
              Go to properties
            </Link>
          }
        />
      ) : (
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
      )}
    </div>
  );
}
