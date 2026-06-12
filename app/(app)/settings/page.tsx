import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import { AddressFields, MAILING_ADDRESS_FORM_FIELDS } from "@/components/address-fields";
import { DetailSection } from "@/components/detail-section";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  connectStripeAccountAction,
  openStripeDashboardAction,
  refreshStripeConnectStatusAction,
  updateProfileAction,
  updateSettingsAction
} from "@/lib/actions";
import { formatAddress, parseAddressText } from "@/lib/address";
import { formatAppDateTime } from "@/lib/app-time";
import { requireUser } from "@/lib/auth";
import { hasAcceptedCurrentPaymentTerms } from "@/lib/legal";
import { getAppBaseUrl } from "@/lib/request-origin";
import { getStripeAccountId, getStripeConnectRedirectStatus, getStripeConnectState, syncManagerConnectedAccount } from "@/lib/stripe-connect";
import { getStripeKeyMode } from "@/lib/stripe-env";
import {
  attachStripeAccountAction,
  reconnectStripeAccountAction,
  resyncStripeAccountAction
} from "@/lib/stripe-repair-actions";
import { getUserByIdFresh } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

function stripeOwnershipReasonLabel(reason?: string) {
  if (reason === "metadata-user-mismatch") return "the Stripe account's metadata belongs to a different Nexus user";
  if (reason === "metadata-organization-mismatch") return "the Stripe account's metadata belongs to a different Nexus organization";
  if (reason === "metadata-missing") return "the Stripe account has no Nexus ownership metadata";
  if (reason === "account-not-found") return "the Stripe account could not be found (possibly a test/live mode mismatch)";
  if (reason === "account-deleted") return "the Stripe account was deleted in Stripe";
  if (reason === "stripe-config") return "Stripe is not available in this environment";
  return "the account's ownership could not be verified";
}

// One explicit message per repair outcome. Status names are fixed vocabulary
// shared with lib/stripe-repair-actions.ts.
function stripeRepairMessage(status?: string, reason?: string) {
  if (status === "repair-success") return "Stripe account verified and attached. Payout status was synced; checkout will route to this account.";
  if (status === "repair-rejected-user-mismatch")
    return "This Stripe account belongs to a different Nexus user in the same organization. Use system admin repair or reconnect.";
  if (status === "repair-rejected-org-mismatch")
    return "This Stripe account belongs to a different Nexus organization, so it can never be attached here. Nothing was changed.";
  if (status === "repair-invalid-account")
    return reason === "invalid-id"
      ? "Enter a Stripe account ID starting with acct_."
      : `That account cannot be attached: ${stripeOwnershipReasonLabel(reason)}. Nothing was changed.`;
  if (status === "resync-success")
    return reason === "metadata-backfilled"
      ? "Stripe account re-synced. Missing ownership metadata was restored from your Nexus account."
      : "Stripe account re-synced. Ownership metadata matches your Nexus account and payout status was refreshed.";
  if (status === "reconnect-started") return "A fresh Stripe onboarding was started. Finish onboarding in Stripe to enable payouts.";
  if (status === "reconnect-confirmation-required") return "Check the confirmation box before starting a fresh Stripe connection.";
  if (status === "repair-error")
    return reason === "stripe-config"
      ? "Stripe is disabled in this environment: the server refused to initialize the Stripe client (live keys are blocked outside production). Nothing was changed. Run this repair on the deployed app, or use a test key locally."
      : "Stripe could not be reached to complete this repair. Nothing was changed. Try again, or check the Stripe status page.";
  return null;
}

const STRIPE_REPAIR_STATUSES = new Set([
  "repair-success",
  "repair-rejected-user-mismatch",
  "repair-rejected-org-mismatch",
  "repair-invalid-account",
  "resync-success",
  "reconnect-started",
  "reconnect-confirmation-required",
  "repair-error"
]);

function stripeSettingsMessage(status?: string) {
  if (status === "connect-return") return "Stripe onboarding returned to Nexus. Refreshing payout status...";
  if (status === "connect-ready") return "Stripe payouts are connected and ready for tenant checkout.";
  if (status === "connect-continue-setup") return "Stripe account exists. Continue setup to finish required onboarding details.";
  if (status === "connect-pending-review") return "Stripe details were submitted. Payouts are pending Stripe review.";
  if (status === "connect-incomplete") return "Stripe setup started, but bank and payout details still need to be completed.";
  if (status === "connect-refresh") return "Stripe setup link expired or was interrupted. Start setup again from this page.";
  if (status === "connect-required") return "Set up Stripe payouts before tenants can pay rent online.";
  if (status === "connect-refreshed") return "Stripe payout status was refreshed.";
  if (status === "connect-not-enabled") return "This Stripe account has not been enabled for Connect yet. Sign up for Connect in Stripe, then try payout setup again.";
  if (status === "connect-error") return "Stripe payout setup could not be opened or refreshed. Check your Stripe keys and try again.";
  if (status === "stripe-dashboard-unavailable") return "This connected account cannot open an Express Dashboard link. Continue onboarding if Stripe requests more information, or contact support to reconnect a compatible account.";
  if (status === "stripe-account-mismatch") return "That Stripe account is not connected to your Nexus organization. It was disconnected so you can set up the correct payout account.";
  if (status === "reconnect-required") return "Your previous Stripe account is no longer accessible (possibly a test/live mode mismatch). Click 'Set up Stripe payouts' to reconnect.";
  if (status === "payment-terms-required") return "Please check the payment processing acknowledgement before starting Stripe payout setup.";
  return null;
}

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const params = (await searchParams) ?? {};
  let stripeStatus = params.stripe;
  let stripeUser = user;

  if (user.role !== "TENANT" && params.stripe === "connect-return") {
    try {
      stripeUser = await syncManagerConnectedAccount(user);
      stripeStatus = getStripeConnectRedirectStatus(stripeUser);
    } catch (error) {
      console.error("[stripe] Failed to refresh Connect status after settings return", error);
      stripeStatus = "connect-error";
    }
  }

  // The store read cache (1s TTL) is per server instance, so the render right
  // after a repair action's redirect can land on an instance whose cache
  // predates the write and silently show the old account ID. Re-read the user
  // uncached whenever we arrive from a repair outcome.
  if (user.role !== "TENANT" && stripeStatus && STRIPE_REPAIR_STATUSES.has(stripeStatus)) {
    const freshUser = await getUserByIdFresh(user.id);
    if (freshUser) {
      stripeUser = { ...user, ...freshUser };
    }
  }

  const appUrl = getAppBaseUrl();
  const stripeKeyMode = getStripeKeyMode();
  const stripeSetup = {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    secretKeyLabel:
      stripeKeyMode === "live"
        ? "Configured — live mode"
        : stripeKeyMode === "test"
          ? "Configured — test mode"
          : stripeKeyMode === "unrecognized"
            ? "Configured — unrecognized key format"
            : "Missing STRIPE_SECRET_KEY",
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    appUrl: Boolean(appUrl),
    webhookUrl: `${appUrl}/api/stripe/webhook`
  };
  const stripeReady = stripeSetup.secretKey && stripeSetup.webhookSecret && stripeSetup.appUrl;
  const stripeConnectState = getStripeConnectState(stripeUser);
  const managerConnect = {
    accountId: getStripeAccountId(stripeUser),
    charges: Boolean(stripeUser.stripeChargesEnabled),
    payouts: Boolean(stripeUser.stripePayoutsEnabled),
    submitted: Boolean(stripeUser.stripeDetailsSubmitted),
    disabledReason: stripeUser.stripeDisabledReason,
    currentlyDue: stripeUser.stripeCurrentlyDue ?? [],
    eventuallyDue: stripeUser.stripeEventuallyDue ?? [],
    ready: stripeConnectState.ready
  };
  // Ownership mismatch: either a verification already recorded a mismatch, or
  // the metadata IDs captured at last sync no longer match this user/org.
  const stripeOwnershipMismatch = Boolean(
    managerConnect.accountId &&
      (stripeUser.stripeMetadataMismatchReason ||
        (stripeUser.stripeMetadataUserId && stripeUser.stripeMetadataUserId !== stripeUser.id) ||
        (stripeUser.stripeMetadataOrganizationId && stripeUser.stripeMetadataOrganizationId !== stripeUser.organizationId))
  );
  const stripeMessage = stripeRepairMessage(stripeStatus, params.reason) ?? stripeSettingsMessage(stripeStatus);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Administration" : user.role === "MANAGER" ? "Profile & workspace" : "Account preferences"}
        title="Settings"
        description={
          user.role === "ADMIN"
            ? "Manage organization details, Stripe Connect, team visibility, and platform-wide configuration."
            : user.role === "MANAGER"
              ? "Update your profile, manage Stripe payouts, and review your assigned portfolio scope."
              : "Update your contact details and review lease documents and notices relevant to your tenancy."
        }
      />

      {user.role !== "TENANT" ? (
        <DetailSection
          id="payments-stripe"
          title="Payments / Stripe"
          description="Stripe onboarding, payout readiness, and webhook configuration live here so collections work stays focused."
          actions={<Badge tone={stripeReady && managerConnect.ready ? "success" : stripeConnectState.tone}>{stripeReady && managerConnect.ready ? "Stripe connected" : stripeConnectState.label}</Badge>}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
            <div className="space-y-4">
              {stripeMessage ? (
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)]">
                  {stripeMessage}
                  {params.account ? (
                    <p className="mt-1 font-mono text-xs font-normal text-[var(--muted)]">
                      Submitted account: {params.account} · Current stored account: {managerConnect.accountId ?? "none"}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {stripeOwnershipMismatch ? (
                <div className="page-alert page-alert-warning">
                  Stripe account mismatch detected. This account may belong to a different Nexus user or organization.
                  Payments should not be routed until this is repaired. Use the repair options below.
                </div>
              ) : null}
              <div className="ops-grid">
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Secret key</p>
                  <p className="mt-2 text-sm font-semibold">{stripeSetup.secretKeyLabel}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Webhook secret</p>
                  <p className="mt-2 text-sm font-semibold">{stripeSetup.webhookSecret ? "Configured" : "Missing STRIPE_WEBHOOK_SECRET"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Stored account ID</p>
                  <p className="mt-2 truncate font-mono text-sm font-semibold">{managerConnect.accountId ?? "Not connected"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Payout status</p>
                  <p className="mt-2 text-sm font-semibold">{stripeConnectState.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{stripeConnectState.detail}</p>
                </div>
              </div>
              {managerConnect.accountId ? (
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Connection diagnostics</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Stored Nexus account ID</dt>
                      <dd className="truncate font-mono font-semibold text-[var(--text)]">{managerConnect.accountId}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Stripe metadata userId</dt>
                      <dd className={`truncate font-mono font-semibold ${stripeUser.stripeMetadataUserId && stripeUser.stripeMetadataUserId !== stripeUser.id ? "text-amber-700" : "text-[var(--text)]"}`}>
                        {stripeUser.stripeMetadataUserId ?? "Not synced"}
                        {stripeUser.stripeMetadataUserId
                          ? stripeUser.stripeMetadataUserId === stripeUser.id
                            ? " (matches you)"
                            : " (different user)"
                          : ""}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Stripe metadata organizationId</dt>
                      <dd className={`truncate font-mono font-semibold ${stripeUser.stripeMetadataOrganizationId && stripeUser.stripeMetadataOrganizationId !== stripeUser.organizationId ? "text-amber-700" : "text-[var(--text)]"}`}>
                        {stripeUser.stripeMetadataOrganizationId ?? "Not synced"}
                        {stripeUser.stripeMetadataOrganizationId
                          ? stripeUser.stripeMetadataOrganizationId === stripeUser.organizationId
                            ? " (matches your organization)"
                            : " (different organization)"
                          : ""}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Account status</dt>
                      <dd className="font-semibold text-[var(--text)]">{stripeConnectState.label}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Payments enabled</dt>
                      <dd className="font-semibold text-[var(--text)]">{managerConnect.charges ? "Yes" : "No"}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Payouts enabled</dt>
                      <dd className="font-semibold text-[var(--text)]">{managerConnect.payouts ? "Yes" : "No"}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Dashboard access type</dt>
                      <dd className="font-semibold text-[var(--text)]">{stripeUser.stripeDashboardType ?? "Unknown"}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Last synced</dt>
                      <dd className="font-semibold text-[var(--text)]">{stripeUser.stripeUpdatedAt ? formatAppDateTime(stripeUser.stripeUpdatedAt) : "Never"}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--muted)]">Ownership verified</dt>
                      <dd className="font-semibold text-[var(--text)]">
                        {stripeUser.stripeMetadataVerifiedAt
                          ? formatAppDateTime(stripeUser.stripeMetadataVerifiedAt)
                          : stripeUser.stripeMetadataMismatchReason
                            ? `No — ${stripeOwnershipReasonLabel(stripeUser.stripeMetadataMismatchReason)}`
                            : "Not verified yet"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {managerConnect.disabledReason || managerConnect.currentlyDue.length || managerConnect.eventuallyDue.length ? (
                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Stripe requirements</p>
                  {managerConnect.disabledReason ? <p className="mt-2 text-sm font-semibold">{managerConnect.disabledReason}</p> : null}
                  {managerConnect.currentlyDue.length ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Currently due: {managerConnect.currentlyDue.join(", ")}</p>
                  ) : null}
                  {managerConnect.eventuallyDue.length ? (
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Eventually due: {managerConnect.eventuallyDue.join(", ")}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Stripe webhook URL</p>
                <p className="mt-2 break-all font-mono text-xs text-[var(--text)]">{stripeSetup.webhookUrl}</p>
              </div>
            </div>
            <div className="grid content-start gap-2">
              {stripeReady && !managerConnect.ready ? (
                <form action={connectStripeAccountAction} className="space-y-2">
                  {!hasAcceptedCurrentPaymentTerms(stripeUser) ? (
                    <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted-strong)]">
                      <input type="checkbox" name="acceptPaymentTerms" required className="mt-0.5 shrink-0" />
                      <span>
                        I understand payments are processed by third-party processors and that Nexus is not an
                        escrow service, bank, or trust account. I agree to the{" "}
                        <Link href="/payment-terms" target="_blank" className="font-semibold underline">Payment Terms</Link>.
                      </span>
                    </label>
                  ) : null}
                  <SubmitButton className="w-full" pendingLabel="Opening Stripe...">
                    <ExternalLink className="h-4 w-4" />
                    {stripeConnectState.actionLabel}
                  </SubmitButton>
                </form>
              ) : stripeReady && managerConnect.ready ? (
                <form action={openStripeDashboardAction}>
                  <SubmitButton className="w-full" pendingLabel="Opening...">
                    <ExternalLink className="h-4 w-4" />
                    Stripe dashboard
                  </SubmitButton>
                </form>
              ) : (
                <Button disabled className="w-full">
                  <ExternalLink className="h-4 w-4" />
                  Add Stripe env first
                </Button>
              )}
              {managerConnect.accountId ? (
                <>
                  <form action={refreshStripeConnectStatusAction}>
                    <SubmitButton className="w-full" variant="secondary" pendingLabel="Refreshing...">
                      <RefreshCw className="h-4 w-4" />
                      Refresh Stripe status
                    </SubmitButton>
                  </form>
                </>
              ) : null}
            </div>
          </div>
          {stripeReady ? (
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Repair Stripe connection</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Use these tools if your payout account is missing, stale, or shows an ownership mismatch. Every option
                verifies the Stripe account&apos;s ownership metadata before anything changes; accounts that belong to a
                different Nexus user or organization are always refused.
              </p>
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text)]">Re-sync current account</p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Re-verifies the stored account against Stripe and refreshes payout status. Refuses if ownership
                    metadata does not match you.
                  </p>
                  {managerConnect.accountId ? (
                    <form action={resyncStripeAccountAction}>
                      <SubmitButton className="w-full" variant="secondary" pendingLabel="Re-syncing...">
                        <RefreshCw className="h-4 w-4" />
                        Re-sync stored account
                      </SubmitButton>
                    </form>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">No stored account to re-sync.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text)]">Attach account by ID</p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    The account is retrieved from Stripe and attached only if its metadata maps to your Nexus user and
                    organization.
                  </p>
                  <form action={attachStripeAccountAction} className="space-y-2">
                    <input
                      name="accountId"
                      required
                      pattern="acct_[A-Za-z0-9]+"
                      placeholder="acct_..."
                      className="field font-mono text-xs"
                      aria-label="Stripe account ID"
                    />
                    <SubmitButton className="w-full" variant="secondary" pendingLabel="Verifying...">
                      Verify and attach
                    </SubmitButton>
                  </form>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text)]">Start fresh</p>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Disconnects the stored account ID and starts new Stripe onboarding. The old Stripe account is not
                    deleted and past payment records are unchanged.
                  </p>
                  <form action={reconnectStripeAccountAction} className="space-y-2">
                    <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted-strong)]">
                      <input type="checkbox" name="confirmReconnect" required className="mt-0.5 shrink-0" />
                      <span>I understand this replaces my current Stripe payout connection.</span>
                    </label>
                    {!hasAcceptedCurrentPaymentTerms(stripeUser) ? (
                      <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted-strong)]">
                        <input type="checkbox" name="acceptPaymentTerms" required className="mt-0.5 shrink-0" />
                        <span>
                          I understand payments are processed by third-party processors and agree to the{" "}
                          <Link href="/payment-terms" target="_blank" className="font-semibold underline">Payment Terms</Link>.
                        </span>
                      </label>
                    ) : null}
                    <SubmitButton className="w-full" variant="secondary" pendingLabel="Starting...">
                      <ExternalLink className="h-4 w-4" />
                      Reconnect Stripe
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      <div className="content-split-tight">
        {user.role === "ADMIN" ? (
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Organization settings</p>
            <h2 className="mt-2 text-xl font-semibold">Account and business profile</h2>
            {params.error ? (
              <div className="page-alert page-alert-warning mt-4">
                {params.error === "invalid-address"
                  ? "Enter a complete mailing address with street, city, state, ZIP or postal code, and country."
                  : "Review the organization settings and try again."}
              </div>
            ) : null}
            <form action={updateSettingsAction} className="mt-5 space-y-3">
              <div>
                <label className="field-label" htmlFor="settings-name">Organization name</label>
                <input id="settings-name" name="name" defaultValue={user.organization.name} className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="settings-email">Billing email</label>
                <input id="settings-email" name="email" defaultValue={user.organization.email} className="field" />
              </div>
              <PhoneInput name="phone" defaultValue={user.organization.phone ?? ""} />
              <AddressFields
                fieldNames={MAILING_ADDRESS_FORM_FIELDS}
                defaultValue={parseAddressText(user.organization.mailingAddress)}
                required={false}
              />
              <SubmitButton>Update settings</SubmitButton>
            </form>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">My profile</p>
            <h2 className="mt-2 text-xl font-semibold">Contact details</h2>
            <form action={updateProfileAction} className="mt-5 space-y-3">
              <div className="form-grid-2">
                <div>
                  <label className="field-label" htmlFor="profile-first">First name</label>
                  <input id="profile-first" name="firstName" defaultValue={user.firstName} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor="profile-last">Last name</label>
                  <input id="profile-last" name="lastName" defaultValue={user.lastName} className="field" />
                </div>
              </div>
              <PhoneInput name="phone" defaultValue={user.phone ?? ""} />
              <div>
                <label className="field-label" htmlFor="profile-title">Job title</label>
                <input id="profile-title" name="title" defaultValue={user.title ?? ""} placeholder="e.g. Property Manager" className="field" />
              </div>
              <SubmitButton>Save profile</SubmitButton>
            </form>
          </Card>
        )}
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Account summary</p>
          <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Name</span>
              <span className="font-semibold text-[var(--text)]">{user.firstName} {user.lastName}</span>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Email</span>
              <span className="text-sm text-[var(--text)]">{user.email}</span>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:items-center">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Access</span>
              <Badge>{user.role}</Badge>
            </div>
          </div>
          <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {user.role === "ADMIN" ? (
              portal.managers.map((manager) => (
                <div key={manager.id} className="py-3">
                  <p className="font-semibold">{manager.firstName} {manager.lastName}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{manager.title || "Property Manager"}</p>
                </div>
              ))
            ) : user.role === "MANAGER" ? (
              portal.scope.properties.map((property) => (
                <div key={property.id} className="py-3">
                  <p className="font-semibold">{property.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{formatAddress(property)}</p>
                </div>
              ))
            ) : (
              portal.documents.map((file) => (
                <div key={file.id} className="py-3">
                  <p className="font-semibold">{file.label || file.kind}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{file.path}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
