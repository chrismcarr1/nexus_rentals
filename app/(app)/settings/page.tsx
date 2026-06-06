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
import { requireUser } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/request-origin";
import { getStripeAccountId, getStripeConnectRedirectStatus, getStripeConnectState, syncStripeConnectedAccount } from "@/lib/stripe-connect";
import { getPortalContext } from "@/services/portal";

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
      stripeUser = await syncStripeConnectedAccount(user);
      stripeStatus = getStripeConnectRedirectStatus(stripeUser);
    } catch (error) {
      console.error("[stripe] Failed to refresh Connect status after settings return", error);
      stripeStatus = "connect-error";
    }
  }

  const appUrl = getAppBaseUrl();
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
  const stripeMessage = stripeSettingsMessage(stripeStatus);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={user.role === "ADMIN" ? "Settings and controls" : user.role === "MANAGER" ? "Profile and workspace" : "Profile and preferences"}
        title={
          user.role === "ADMIN"
            ? "Platform settings, team visibility, and permissions context."
            : user.role === "MANAGER"
              ? "Your profile, assigned scope, and operational reference materials."
              : "Resident account details and communication preferences."
        }
        description={
          user.role === "ADMIN"
            ? "Admins retain global settings and team-level visibility. Managers and tenants get intentionally narrower settings experiences."
            : user.role === "MANAGER"
              ? "Keep your contact details current while staying grounded in the portfolio scope you actively manage."
              : "Update your basic profile details and review the documents and notices most relevant to your tenancy."
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
                </div>
              ) : null}
              <div className="ops-grid">
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Secret key</p>
                  <p className="mt-2 text-sm font-semibold">{stripeSetup.secretKey ? "Configured" : "Missing STRIPE_SECRET_KEY"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Webhook secret</p>
                  <p className="mt-2 text-sm font-semibold">{stripeSetup.webhookSecret ? "Configured" : "Missing STRIPE_WEBHOOK_SECRET"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Connected account</p>
                  <p className="mt-2 truncate text-sm font-semibold">{managerConnect.accountId ?? "Not connected"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Payout status</p>
                  <p className="mt-2 text-sm font-semibold">{stripeConnectState.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{stripeConnectState.detail}</p>
                </div>
              </div>
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
                <form action={connectStripeAccountAction}>
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
        </DetailSection>
      ) : null}

      <div className="content-split-tight">
        {user.role === "ADMIN" ? (
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Organization settings</p>
            <h1 className="mt-2 text-3xl font-semibold">Account and business profile</h1>
            {params.error ? (
              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {params.error === "invalid-address"
                  ? "Enter a complete mailing address with street, city, state, ZIP or postal code, and country."
                  : "Review the organization settings and try again."}
              </div>
            ) : null}
            <form action={updateSettingsAction} className="mt-6 space-y-4">
              <input name="name" defaultValue={user.organization.name} className="field" />
              <input name="email" defaultValue={user.organization.email} className="field" />
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
            <h1 className="mt-2 text-3xl font-semibold">Basic account details</h1>
            <form action={updateProfileAction} className="mt-6 space-y-4">
              <div className="form-grid-2">
                <input name="firstName" defaultValue={user.firstName} className="field" />
                <input name="lastName" defaultValue={user.lastName} className="field" />
              </div>
              <PhoneInput name="phone" defaultValue={user.phone ?? ""} />
              <input name="title" defaultValue={user.title ?? ""} className="field" />
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
