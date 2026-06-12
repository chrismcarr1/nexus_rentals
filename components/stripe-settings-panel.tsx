import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  CircleAlert,
  CircleDashed,
  CreditCard,
  ExternalLink,
  Landmark,
  Link2,
  RefreshCw,
  ShieldCheck,
  Webhook,
  Wrench
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  connectStripeAccountAction,
  openStripeDashboardAction,
  refreshStripeConnectStatusAction
} from "@/lib/actions";
import {
  attachStripeAccountAction,
  reconnectStripeAccountAction,
  resyncStripeAccountAction
} from "@/lib/stripe-repair-actions";
import type { User } from "@/lib/store";

type HealthTone = "success" | "warning" | "danger";

type StripeSettingsPanelProps = {
  stripeReady: boolean;
  stripeStatus?: string;
  stripeMessage: string | null;
  submittedAccountId?: string;
  ownershipMismatch: boolean;
  paymentTermsAccepted: boolean;
  connectState: {
    label: string;
    detail: string;
    actionLabel: string;
    ready: boolean;
    tone: "warning" | "success";
  };
  account: {
    id?: string;
    paymentsEnabled: boolean;
    payoutsEnabled: boolean;
    disabledReason?: string;
    currentlyDue: string[];
    eventuallyDue: string[];
    dashboardType?: string;
    lastSyncedLabel: string;
    ownershipVerifiedLabel: string;
  };
  owner: Pick<
    User,
    | "id"
    | "organizationId"
    | "stripeMetadataUserId"
    | "stripeMetadataOrganizationId"
    | "stripeMetadataVerifiedAt"
    | "stripeMetadataMismatchReason"
  >;
  environment: {
    keyModeLabel: string;
    keyModeTone: "success" | "warning" | "default";
    webhookConfigured: boolean;
    webhookUrl: string;
    appHost: string;
  };
};

function statusPresentation({
  stripeReady,
  ownershipMismatch,
  connected
}: {
  stripeReady: boolean;
  ownershipMismatch: boolean;
  connected: boolean;
}) {
  if (ownershipMismatch) {
    return { label: "Needs attention", tone: "danger" as const };
  }
  if (connected) {
    return { label: "Stripe connected", tone: "success" as const };
  }
  if (!stripeReady) {
    return { label: "Setup required", tone: "warning" as const };
  }
  return { label: "Needs attention", tone: "warning" as const };
}

function messagePresentation(status?: string) {
  if (["repair-success", "resync-success", "reconnect-started", "connect-ready", "connect-refreshed"].includes(status ?? "")) {
    return {
      tone: "success" as const,
      title: status === "reconnect-started" ? "Onboarding started" : "Stripe connection updated",
      next: status === "reconnect-started" ? "Complete the Stripe onboarding flow to enable payouts." : "No additional action is required."
    };
  }
  if (status === "connect-return") {
    return {
      tone: "info" as const,
      title: "Checking your Stripe account",
      next: "Nexus is refreshing the latest payout and verification status."
    };
  }
  if (["repair-rejected-user-mismatch", "repair-rejected-org-mismatch", "stripe-account-mismatch"].includes(status ?? "")) {
    return {
      tone: "danger" as const,
      title: "Account ownership could not be verified",
      next: "Use a repair option below before accepting payments."
    };
  }
  return {
    tone: "warning" as const,
    title: "Stripe needs attention",
    next: status === "stripe-dashboard-unavailable"
      ? "Continue onboarding if Stripe requests information, or re-sync the account."
      : "Review the connection health and recommended actions below."
  };
}

function HealthIcon({ tone }: { tone: HealthTone }) {
  if (tone === "success") return <Check className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === "danger") return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />;
}

function DiagnosticRow({
  label,
  value,
  detail,
  tone,
  mono = false
}: {
  label: string;
  value: string;
  detail: string;
  tone: HealthTone;
  mono?: boolean;
}) {
  return (
    <div className="stripe-health-row">
      <span className={`stripe-health-indicator stripe-health-indicator-${tone}`}>
        <HealthIcon tone={tone} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="stripe-health-label">{label}</p>
        <p className="stripe-health-detail">{detail}</p>
      </div>
      <span className={`stripe-health-value ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function OverviewTile({
  icon: Icon,
  label,
  value,
  badge,
  mono = false
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  badge?: { label: string; tone: "default" | "success" | "warning" | "danger" | "brand" };
  mono?: boolean;
}) {
  return (
    <div className="stripe-overview-tile">
      <div className="stripe-overview-tile-heading">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="stripe-overview-tile-value-row">
        <p className={`stripe-overview-tile-value ${mono ? "stripe-overview-account-id font-mono" : ""}`} title={mono ? value : undefined}>
          {value}
        </p>
      </div>
      {badge ? <Badge tone={badge.tone} className="stripe-overview-tile-badge">{badge.label}</Badge> : null}
    </div>
  );
}

function StripeAlert({
  message,
  status,
  submittedAccountId,
  currentAccountId
}: {
  message: string;
  status?: string;
  submittedAccountId?: string;
  currentAccountId?: string;
}) {
  const presentation = messagePresentation(status);
  return (
    <div className={`stripe-settings-alert stripe-settings-alert-${presentation.tone}`} role="status">
      <span className="stripe-settings-alert-icon">
        {presentation.tone === "success" ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className="stripe-settings-alert-title">{presentation.title}</p>
        <p className="stripe-settings-alert-message">{message}</p>
        <p className="stripe-settings-alert-next">{presentation.next}</p>
        {submittedAccountId ? (
          <p className="stripe-settings-alert-account font-mono">
            Submitted: {submittedAccountId} · Stored: {currentAccountId ?? "none"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PrimaryActions({
  stripeReady,
  connected,
  accountId,
  paymentTermsAccepted,
  actionLabel
}: {
  stripeReady: boolean;
  connected: boolean;
  accountId?: string;
  paymentTermsAccepted: boolean;
  actionLabel: string;
}) {
  return (
    <div className="stripe-primary-actions">
      {stripeReady && !connected ? (
        <form action={connectStripeAccountAction} className="space-y-3">
          {!paymentTermsAccepted ? (
            <label className="stripe-terms-check">
              <input type="checkbox" name="acceptPaymentTerms" required />
              <span>
                I understand payments are processed by third-party processors and that Nexus is not an escrow service,
                bank, or trust account. I agree to the{" "}
                <Link href="/payment-terms" target="_blank" className="font-semibold underline">
                  Payment Terms
                </Link>.
              </span>
            </label>
          ) : null}
          <SubmitButton className="w-full" pendingLabel="Opening Stripe...">
            <ExternalLink className="h-4 w-4" />
            {actionLabel}
          </SubmitButton>
        </form>
      ) : stripeReady && connected ? (
        <form action={openStripeDashboardAction}>
          <SubmitButton className="w-full" pendingLabel="Opening dashboard...">
            <ArrowUpRight className="h-4 w-4" />
            Open Stripe dashboard
          </SubmitButton>
        </form>
      ) : (
        <Button disabled className="w-full">
          <ExternalLink className="h-4 w-4" />
          Configure Stripe first
        </Button>
      )}

      {accountId ? (
        <form action={refreshStripeConnectStatusAction}>
          <SubmitButton className="w-full" variant="secondary" pendingLabel="Refreshing...">
            <RefreshCw className="h-4 w-4" />
            Refresh status
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export function StripeSettingsPanel({
  stripeReady,
  stripeStatus,
  stripeMessage,
  submittedAccountId,
  ownershipMismatch,
  paymentTermsAccepted,
  connectState,
  account,
  owner,
  environment
}: StripeSettingsPanelProps) {
  const status = statusPresentation({
    stripeReady,
    ownershipMismatch,
    connected: account.id ? connectState.ready : false
  });
  const metadataUserMatches = Boolean(owner.stripeMetadataUserId && owner.stripeMetadataUserId === owner.id);
  const metadataOrganizationMatches = Boolean(
    owner.stripeMetadataOrganizationId && owner.stripeMetadataOrganizationId === owner.organizationId
  );
  const ownershipVerified = Boolean(owner.stripeMetadataVerifiedAt && !ownershipMismatch);
  const dashboardLabel = account.dashboardType
    ? `${account.dashboardType.charAt(0).toUpperCase()}${account.dashboardType.slice(1)}`
    : account.id
      ? "Unknown"
      : "Unavailable";

  return (
    <section id="payments-stripe" className="stripe-settings">
      <div className="stripe-settings-heading">
        <div>
          <p className="stripe-settings-eyebrow">Settings category</p>
          <h2 className="stripe-settings-title">Payments</h2>
          <p className="stripe-settings-subtitle">Stripe connection, payment processing, payouts, and account verification.</p>
        </div>
        <Badge tone={status.tone} className="stripe-settings-status">
          <span className="stripe-settings-status-dot" aria-hidden="true" />
          {status.label}
        </Badge>
      </div>

      <div className="stripe-settings-stack">
        <div className="stripe-settings-card stripe-workspace-card">
          {stripeMessage ? (
            <StripeAlert
              message={stripeMessage}
              status={stripeStatus}
              submittedAccountId={submittedAccountId}
              currentAccountId={account.id}
            />
          ) : null}

          {ownershipMismatch ? (
            <div className="stripe-critical-alert" role="alert">
              <span className="stripe-critical-alert-icon">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="stripe-critical-alert-title">Payments are blocked until ownership is verified</p>
                <p className="stripe-critical-alert-message">
                  Stripe account mismatch detected. This account may belong to a different Nexus user or organization.
                  Payments should not be routed until Nexus verifies the correct connection.
                </p>
                <p className="stripe-critical-alert-next">Recommended: begin with Step 1 in the connection recovery workflow below.</p>
              </div>
            </div>
          ) : null}

          {stripeMessage || ownershipMismatch ? <div className="stripe-workspace-divider" /> : null}

          <div className="stripe-overview-header">
            <div className="stripe-card-heading">
              <span className="stripe-card-icon">
                <CreditCard className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="stripe-card-kicker">Payment account overview</p>
                <h3 className="stripe-card-title">{account.id ? "Stripe account connected" : "Connect your Stripe account"}</h3>
                <p className="stripe-card-description">{connectState.detail}</p>
              </div>
            </div>
            <div className="stripe-overview-actions">
              <PrimaryActions
                stripeReady={stripeReady}
                connected={connectState.ready}
                accountId={account.id}
                paymentTermsAccepted={paymentTermsAccepted}
                actionLabel={connectState.actionLabel}
              />
            </div>
          </div>

          <div className="stripe-overview-grid">
            <OverviewTile
              icon={Link2}
              label="Account"
              value={account.id ?? "Not connected"}
              mono={Boolean(account.id)}
              badge={account.id ? { label: "Connected", tone: "success" } : { label: "Setup required", tone: "warning" }}
            />
            <OverviewTile
              icon={CreditCard}
              label="Payments"
              value={account.paymentsEnabled ? "Enabled" : "Unavailable"}
              badge={account.paymentsEnabled ? { label: "Ready", tone: "success" } : { label: "Needs attention", tone: "warning" }}
            />
            <OverviewTile
              icon={Landmark}
              label="Payouts"
              value={account.payoutsEnabled ? "Enabled" : "Unavailable"}
              badge={account.payoutsEnabled ? { label: "Ready", tone: "success" } : { label: "Needs attention", tone: "warning" }}
            />
            <OverviewTile
              icon={Building2}
              label="Dashboard"
              value={dashboardLabel}
              badge={account.dashboardType === "express" ? { label: "Verified", tone: "success" } : undefined}
            />
            <OverviewTile
              icon={RefreshCw}
              label="Last synced"
              value={account.lastSyncedLabel}
            />
          </div>

          <div className="stripe-workspace-divider" />

          <div className="stripe-settings-grid">
            <section className="stripe-workspace-section">
            <div className="stripe-card-heading stripe-card-heading-compact">
              <span className="stripe-card-icon stripe-card-icon-success">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="stripe-card-kicker">Connection health</p>
                <h3 className="stripe-card-title">Account verification checklist</h3>
                <p className="stripe-card-description">A quick view of ownership, payment, and payout readiness.</p>
              </div>
            </div>

            <div className="stripe-health-list">
              <DiagnosticRow
                label="Nexus account linked"
                value={account.id ? "Connected" : "Not linked"}
                detail={account.id ? "A Stripe account ID is stored for this manager." : "No Stripe account is currently stored."}
                tone={account.id ? "success" : "warning"}
                mono={Boolean(account.id)}
              />
              <DiagnosticRow
                label="Stripe metadata user matches"
                value={metadataUserMatches ? "Verified" : owner.stripeMetadataUserId ? "Mismatch" : "Not synced"}
                detail={metadataUserMatches ? "The Stripe user metadata matches this Nexus user." : "Ownership metadata must match before routing payments."}
                tone={metadataUserMatches ? "success" : owner.stripeMetadataUserId ? "danger" : "warning"}
              />
              <DiagnosticRow
                label="Stripe metadata organization matches"
                value={metadataOrganizationMatches ? "Verified" : owner.stripeMetadataOrganizationId ? "Mismatch" : "Not synced"}
                detail={metadataOrganizationMatches ? "The Stripe organization metadata matches this workspace." : "Organization ownership has not been verified."}
                tone={metadataOrganizationMatches ? "success" : owner.stripeMetadataOrganizationId ? "danger" : "warning"}
              />
              <DiagnosticRow
                label="Ownership verified"
                value={ownershipVerified ? "Verified" : ownershipMismatch ? "Blocked" : "Pending"}
                detail={account.ownershipVerifiedLabel}
                tone={ownershipVerified ? "success" : ownershipMismatch ? "danger" : "warning"}
              />
              <DiagnosticRow
                label="Payments enabled"
                value={account.paymentsEnabled ? "Ready" : "Unavailable"}
                detail={account.paymentsEnabled ? "This account can receive tenant payment transfers." : "Stripe has not enabled payment processing yet."}
                tone={account.paymentsEnabled ? "success" : "warning"}
              />
              <DiagnosticRow
                label="Payouts enabled"
                value={account.payoutsEnabled ? "Ready" : "Unavailable"}
                detail={account.payoutsEnabled ? "Funds can be paid out to the connected bank account." : "Stripe has not enabled payouts yet."}
                tone={account.payoutsEnabled ? "success" : "warning"}
              />
            </div>

            {account.disabledReason || account.currentlyDue.length || account.eventuallyDue.length ? (
              <div className="stripe-requirements">
                <div className="stripe-requirements-heading">
                  <CircleAlert className="h-4 w-4" />
                  <span>Stripe requirements</span>
                </div>
                {account.disabledReason ? <p className="stripe-requirements-primary">{account.disabledReason}</p> : null}
                {account.currentlyDue.length ? (
                  <p className="stripe-requirements-detail">Currently due: {account.currentlyDue.join(", ")}</p>
                ) : null}
                {account.eventuallyDue.length ? (
                  <p className="stripe-requirements-detail">Eventually due: {account.eventuallyDue.join(", ")}</p>
                ) : null}
              </div>
            ) : null}
            </section>

            <section className="stripe-workspace-section stripe-environment-card">
            <div className="stripe-card-heading stripe-card-heading-compact">
              <span className="stripe-card-icon">
                <Webhook className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="stripe-card-kicker">Webhook &amp; environment</p>
                <h3 className="stripe-card-title">Processing configuration</h3>
                <p className="stripe-card-description">Safe configuration details for administrators.</p>
              </div>
            </div>

            <dl className="stripe-environment-list">
              <div className="stripe-environment-row">
                <dt>Stripe key mode</dt>
                <dd><Badge tone={environment.keyModeTone}>{environment.keyModeLabel}</Badge></dd>
              </div>
              <div className="stripe-environment-row">
                <dt>Webhook secret</dt>
                <dd><Badge tone={environment.webhookConfigured ? "success" : "warning"}>{environment.webhookConfigured ? "Configured" : "Missing"}</Badge></dd>
              </div>
              <div className="stripe-environment-row">
                <dt>APP_URL host</dt>
                <dd className="font-mono">{environment.appHost}</dd>
              </div>
              <div className="stripe-environment-row stripe-environment-row-stack">
                <dt>Webhook URL</dt>
                <dd className="stripe-code-pill font-mono">{environment.webhookUrl}</dd>
              </div>
            </dl>
            </section>
          </div>

          {stripeReady ? (
            <>
              <div className="stripe-workspace-divider" />
              <section className="stripe-recovery">
                <div className="stripe-card-heading">
              <span className="stripe-card-icon">
                <Wrench className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                    <p className="stripe-card-kicker">Nexus connection recovery</p>
                    <h3 className="stripe-card-title">Restore Stripe access with a guided workflow</h3>
                <p className="stripe-card-description">
                      Start with the recommended check. Nexus verifies ownership before changing a payout connection and refuses accounts assigned to another user or organization.
                </p>
              </div>
            </div>

                <ol className="stripe-recovery-workflow">
                  <li className="stripe-recovery-step stripe-recovery-step-recommended">
                    <span className="stripe-recovery-step-number">1</span>
                    <div className="stripe-recovery-step-copy">
                      <div className="stripe-recovery-step-title">
                        <h4>Let Nexus verify the current connection</h4>
                        <Badge tone="brand">Recommended</Badge>
                      </div>
                      <p>Nexus checks the stored Stripe account, confirms its ownership metadata, and refreshes payment and payout readiness.</p>
                </div>
                    <div className="stripe-recovery-step-action">
                {account.id ? (
                  <form action={resyncStripeAccountAction}>
                          <SubmitButton className="stripe-action-button w-full" variant="secondary" pendingLabel="Checking connection...">
                      <RefreshCw className="h-4 w-4" />
                            Check current connection
                    </SubmitButton>
                  </form>
                ) : (
                        <Button className="stripe-action-button w-full" variant="secondary" disabled>No account to check</Button>
                )}
                    </div>
                  </li>

                  <li className="stripe-recovery-step">
                    <span className="stripe-recovery-step-number">2</span>
                    <div className="stripe-recovery-step-copy">
                      <h4>Recover a known Stripe account</h4>
                      <p>Use an existing account ID when the connection is missing. Nexus attaches it only after the user and organization metadata match.</p>
                    </div>
                    <form action={attachStripeAccountAction} className="stripe-recovery-step-action space-y-2.5">
                  <input
                    name="accountId"
                    required
                    pattern="acct_[A-Za-z0-9]+"
                    placeholder="acct_..."
                    className="field font-mono text-xs"
                    aria-label="Stripe account ID"
                  />
                      <SubmitButton className="stripe-action-button w-full" variant="secondary" pendingLabel="Verifying account...">
                        <Link2 className="h-4 w-4" />
                        Verify and recover account
                  </SubmitButton>
                </form>
                  </li>

                  <li className="stripe-recovery-step stripe-recovery-step-caution">
                    <span className="stripe-recovery-step-number">3</span>
                    <div className="stripe-recovery-step-copy">
                      <div className="stripe-recovery-step-title">
                        <h4>Create a replacement connection</h4>
                        <Badge tone="warning">Last resort</Badge>
                      </div>
                      <p>Start new Stripe onboarding only when the current account cannot be recovered. Past payment records and the old Stripe account remain unchanged.</p>
                    </div>
                    <form action={reconnectStripeAccountAction} className="stripe-recovery-step-action space-y-2.5">
                  <label className="stripe-confirmation-check">
                    <input type="checkbox" name="confirmReconnect" required />
                        <span>I understand this replaces the current Nexus payout connection.</span>
                  </label>
                  {!paymentTermsAccepted ? (
                    <label className="stripe-confirmation-check">
                      <input type="checkbox" name="acceptPaymentTerms" required />
                      <span>
                        I agree to the{" "}
                        <Link href="/payment-terms" target="_blank" className="font-semibold underline">
                          Payment Terms
                        </Link>.
                      </span>
                    </label>
                  ) : null}
                      <SubmitButton className="stripe-action-button w-full" variant="secondary" pendingLabel="Starting secure setup...">
                        <ExternalLink className="h-4 w-4" />
                        Start replacement setup
                  </SubmitButton>
                </form>
                  </li>
                </ol>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
