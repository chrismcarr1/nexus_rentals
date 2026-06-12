import { AddressFields, MAILING_ADDRESS_FORM_FIELDS } from "@/components/address-fields";
import { PageHeader } from "@/components/page-header";
import { StripeSettingsPanel } from "@/components/stripe-settings-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateProfileAction, updateSettingsAction } from "@/lib/actions";
import { formatAddress, parseAddressText } from "@/lib/address";
import { formatAppDateTime } from "@/lib/app-time";
import { requireUser } from "@/lib/auth";
import { hasAcceptedCurrentPaymentTerms } from "@/lib/legal";
import { getAppBaseUrl } from "@/lib/request-origin";
import { getStripeAccountId, getStripeConnectRedirectStatus, getStripeConnectState, syncManagerConnectedAccount } from "@/lib/stripe-connect";
import { getStripeKeyMode } from "@/lib/stripe-env";
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
  const stripeAppHost = (() => {
    try {
      return new URL(appUrl).host;
    } catch {
      return "Unavailable";
    }
  })();

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
        <StripeSettingsPanel
          stripeReady={stripeReady}
          stripeStatus={stripeStatus}
          stripeMessage={stripeMessage}
          submittedAccountId={params.account}
          ownershipMismatch={stripeOwnershipMismatch}
          paymentTermsAccepted={hasAcceptedCurrentPaymentTerms(stripeUser)}
          connectState={stripeConnectState}
          account={{
            id: managerConnect.accountId,
            paymentsEnabled: managerConnect.charges,
            payoutsEnabled: managerConnect.payouts,
            disabledReason: managerConnect.disabledReason,
            currentlyDue: managerConnect.currentlyDue,
            eventuallyDue: managerConnect.eventuallyDue,
            dashboardType: stripeUser.stripeDashboardType,
            lastSyncedLabel: stripeUser.stripeUpdatedAt ? formatAppDateTime(stripeUser.stripeUpdatedAt) : "Never",
            ownershipVerifiedLabel: stripeUser.stripeMetadataVerifiedAt
              ? formatAppDateTime(stripeUser.stripeMetadataVerifiedAt)
              : stripeUser.stripeMetadataMismatchReason
                ? `No — ${stripeOwnershipReasonLabel(stripeUser.stripeMetadataMismatchReason)}`
                : "Not verified yet"
          }}
          owner={stripeUser}
          environment={{
            keyModeLabel:
              stripeKeyMode === "live"
                ? "Live mode"
                : stripeKeyMode === "test"
                  ? "Test mode"
                  : stripeKeyMode === "unrecognized"
                    ? "Unrecognized"
                    : "Missing",
            keyModeTone: stripeKeyMode === "live" || stripeKeyMode === "test" ? "success" : stripeKeyMode === "missing" ? "warning" : "default",
            webhookConfigured: stripeSetup.webhookSecret,
            webhookUrl: stripeSetup.webhookUrl,
            appHost: stripeAppHost
          }}
        />
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
