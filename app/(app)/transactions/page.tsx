import { AlertTriangle, CreditCard, ExternalLink, Link2, LockKeyhole, RefreshCw, Send, Settings2, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";

import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  connectStripeAccountAction,
  createPaymentAction,
  createStripeCheckoutAction,
  linkRentPaymentsToLeasesAction,
  openStripeDashboardAction,
  refreshStripeConnectStatusAction
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import { badgeToneFromPayment, getPortalContext } from "@/services/portal";

function stripeStatusMessage(status?: string) {
  if (status === "success") return "Stripe checkout completed. Your payment status will update as soon as Stripe confirms the webhook.";
  if (status === "cancelled") return "Stripe checkout was cancelled. No payment was recorded.";
  if (status === "invalid-payment") return "That rent payment could not be found for your tenant account.";
  if (status === "already-paid") return "That rent payment is already marked paid.";
  if (status === "missing-lease") return "This rent charge is not connected to an active lease. Ask your manager to link the charge to your lease or unit.";
  if (status === "invalid-amount") return "This rent charge has no payable balance.";
  if (status === "amount-below-platform-fee") return "Stripe checkout requires the rent balance to be greater than the $1 Nexus platform fee.";
  if (status === "checkout-error") return "Stripe checkout could not be started. Please try again or contact management.";
  if (status === "missing-session-url") return "Stripe did not return a checkout link. Please try again.";
  if (status === "payment-linked") return "Rent charge saved and linked to the active lease for that unit.";
  if (status === "payment-unlinked") return "Rent charge saved, but no active lease was found for that unit yet.";
  if (status === "payments-linked") return "Existing rent charges were checked and linked to active leases where possible.";
  if (status === "connect-ready") return "Stripe payouts are connected. Tenants can now pay lease-linked rent through Checkout.";
  if (status === "connect-incomplete") return "Stripe setup started, but bank and payout details still need to be completed.";
  if (status === "connect-refresh") return "Stripe setup link expired or was interrupted. Start setup again from this page.";
  if (status === "connect-required") return "Set up Stripe payouts before tenants can pay rent online.";
  if (status === "manager-connect-required") return "This rent payment is ready, but the manager needs to finish Stripe payout setup first.";
  if (status === "connect-refreshed") return "Stripe payout status was refreshed.";
  if (status === "connect-not-enabled") return "This Stripe account has not been enabled for Connect yet. Sign up for Connect in Stripe, then try payout setup again.";
  if (status === "connect-error") return "Stripe payout setup could not be opened or refreshed. Check your Stripe keys and try again.";
  if (status) return "Stripe checkout could not continue for this payment.";
  return null;
}

async function getSetupPanelAppUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const headerOrigin = host ? `${proto}://${host}` : null;
  const configuredOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL)?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && configuredOrigin) return configuredOrigin;
  return headerOrigin ?? configuredOrigin ?? "http://localhost:3000";
}

export default async function TransactionsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const portal = await getPortalContext(user);
  const stripeMessage = stripeStatusMessage(params.stripe);
  const paidPayments = portal.scope.payments.filter((payment) => payment.status === "PAID");
  const unpaidPayments = portal.scope.payments.filter((payment) => payment.status !== "PAID");
  const stripePayments = portal.scope.payments.filter((payment) => payment.stripeCheckoutSessionId);
  const nextPaymentAmount = portal.nextPayment ? portal.nextPayment.balanceDue || portal.nextPayment.amount : 0;
  const appUrl = await getSetupPanelAppUrl();
  const stripeSetup = {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    appUrl: Boolean(appUrl),
    webhookUrl: `${appUrl}/api/stripe/webhook`
  };
  const stripeReady = stripeSetup.secretKey && stripeSetup.webhookSecret && stripeSetup.appUrl;
  const managerConnect = {
    accountId: user.stripeConnectedAccountId,
    charges: Boolean(user.stripeChargesEnabled),
    payouts: Boolean(user.stripePayoutsEnabled),
    submitted: Boolean(user.stripeDetailsSubmitted),
    ready: Boolean(user.stripeConnectedAccountId && user.stripeChargesEnabled && user.stripePayoutsEnabled && user.stripeOnboardingComplete)
  };
  const managerPaymentsReady = stripeReady && managerConnect.ready;
  const unlinkedPayments = portal.scope.payments.filter((payment) => payment.status !== "PAID" && !payment.leaseId);

  if (user.role === "TENANT") {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Payments"
          title="Balance clarity and a simple rent payment flow."
          description="See current amounts due, prior payment activity, and take the next rent action without digging through operational screens."
          actions={
            portal.nextPayment ? (
              <form action={createStripeCheckoutAction}>
                <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                <SubmitButton pendingLabel="Opening Stripe...">
                  <CreditCard className="h-4 w-4" />
                  Pay rent with Stripe
                </SubmitButton>
              </form>
            ) : (
              <Button variant="secondary" disabled>
                <ShieldCheck className="h-4 w-4" />
                No payment due
              </Button>
            )
          }
        />
        {stripeMessage ? (
          <Card className="p-4">
            <p className="text-sm font-semibold text-[var(--text)]">{stripeMessage}</p>
          </Card>
        ) : null}
        <Card className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--brand)]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Stripe Checkout</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--text)]">
                  {portal.nextPayment ? `Ready to pay ${formatCurrency(nextPaymentAmount)}` : "Online rent checkout is ready"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Card details stay with Stripe. Nexus Rentals only receives the paid status, session id, payment intent, amount, and timestamp.
                </p>
              </div>
            </div>
            {portal.nextPayment ? (
              <form action={createStripeCheckoutAction} className="shrink-0">
                <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                <SubmitButton pendingLabel="Opening Stripe...">
                  <CreditCard className="h-4 w-4" />
                  Pay rent
                </SubmitButton>
              </form>
            ) : (
              <Button variant="secondary" disabled className="shrink-0">Paid up</Button>
            )}
          </div>
        </Card>
        <div className="content-split-tight">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Account summary</p>
            <div className="mt-5 space-y-4">
              <div className="panel-muted p-4">
                <p className="text-sm text-[var(--muted)]">Balance due</p>
                <p className="mt-2 text-3xl font-semibold">{formatCurrency(portal.metrics.outstanding)}</p>
              </div>
              <div className="panel-muted p-4">
                <p className="text-sm text-[var(--muted)]">Next due date</p>
                <p className="mt-2 text-xl font-semibold">{portal.nextPayment ? formatDate(portal.nextPayment.dueDate) : "No outstanding balance"}</p>
              </div>
              {portal.nextPayment ? (
                <form action={createStripeCheckoutAction}>
                  <input type="hidden" name="paymentId" value={portal.nextPayment.id} />
                  <SubmitButton className="w-full" pendingLabel="Opening Stripe...">Pay rent with Stripe</SubmitButton>
                </form>
              ) : (
                <Button className="w-full" variant="secondary" disabled>No payment due</Button>
              )}
              <p className="text-xs leading-5 text-[var(--muted)]">
                Payments are processed through Stripe Checkout. Nexus Rentals never sees or stores card details.
              </p>
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Payment history</p>
            <DataTable columns={["Description", "Due", "Status", "Channel", "Amount"]} className="mt-5">
              {portal.scope.payments.map((payment) => (
                <tr key={payment.id} className="table-row">
                  <td className="py-4 pr-4 font-semibold">{payment.description}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                  <td className="py-4 pr-4"><Badge tone={badgeToneFromPayment(payment.status)}>{payment.status}</Badge></td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{payment.stripeCheckoutSessionId ? "Stripe" : "Manual"}</td>
                  <td className="py-4 pr-4 font-semibold">{formatCurrency(payment.amount)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Collections"
          title="Payment tracking, outstanding balances, and rent capture."
          description="Focus on the ledger, delinquency follow-up, and fast payment recording for units in your current role scope."
        />
      {stripeMessage ? (
        <Card className="p-4">
          <p className="text-sm font-semibold text-[var(--text)]">{stripeMessage}</p>
        </Card>
      ) : null}
      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--brand)]">
              <Settings2 className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Stripe setup</p>
                <Badge tone={managerPaymentsReady ? "success" : "warning"}>{managerPaymentsReady ? "Online ready" : "Needs setup"}</Badge>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Stripe payout portal and rent requests</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Connect the manager Stripe account for bank payouts, link rent charges to leases, then tenant Checkout routes rent to the manager while Nexus keeps a $1 platform fee.
              </p>
              <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-3">
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">Secret key</p>
                  <p className="mt-1">{stripeSetup.secretKey ? "Configured" : "Missing STRIPE_SECRET_KEY"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">Webhook secret</p>
                  <p className="mt-1">{stripeSetup.webhookSecret ? "Configured" : "Missing STRIPE_WEBHOOK_SECRET"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">App URL</p>
                  <p className="mt-1">{stripeSetup.appUrl ? "Configured" : "Missing NEXT_PUBLIC_APP_URL"}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-3">
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">Connected account</p>
                  <p className="mt-1">{managerConnect.accountId ? managerConnect.accountId : "Not connected"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">Bank setup</p>
                  <p className="mt-1">{managerConnect.submitted ? "Details submitted" : "Needs onboarding"}</p>
                </div>
                <div className="panel-muted p-3">
                  <p className="font-semibold text-[var(--text)]">Payout status</p>
                  <p className="mt-1">
                    {managerConnect.charges && managerConnect.payouts
                      ? "Charges and payouts enabled"
                      : managerConnect.charges
                        ? "Charges enabled; payouts pending"
                        : managerConnect.payouts
                          ? "Payouts enabled; charges pending"
                          : "Not ready yet"}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Stripe webhook URL</p>
                <p className="mt-2 break-all font-mono text-xs text-[var(--text)]">{stripeSetup.webhookUrl}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {stripeReady ? (
              <form action={connectStripeAccountAction}>
                <SubmitButton pendingLabel="Opening Stripe...">
                  <ExternalLink className="h-4 w-4" />
                  {managerConnect.accountId ? "Continue Stripe setup" : "Set up Stripe payouts"}
                </SubmitButton>
              </form>
            ) : (
              <Button disabled>
                <ExternalLink className="h-4 w-4" />
                Add Stripe env first
              </Button>
            )}
            {managerConnect.accountId ? (
              <form action={refreshStripeConnectStatusAction}>
                <SubmitButton variant="secondary" pendingLabel="Refreshing...">
                  <RefreshCw className="h-4 w-4" />
                  Refresh Stripe status
                </SubmitButton>
              </form>
            ) : null}
            {managerConnect.accountId ? (
              <form action={openStripeDashboardAction}>
                <SubmitButton variant="secondary" pendingLabel="Opening...">
                  <ExternalLink className="h-4 w-4" />
                  Stripe dashboard
                </SubmitButton>
              </form>
            ) : null}
            <form action={linkRentPaymentsToLeasesAction}>
              <SubmitButton variant="secondary" pendingLabel="Linking...">
                <Link2 className="h-4 w-4" />
                Link rent charges
              </SubmitButton>
            </form>
            {unlinkedPayments.length ? (
              <p className="max-w-48 text-xs leading-5 text-[var(--muted)]">
                {unlinkedPayments.length} unpaid charges need lease links.
              </p>
            ) : (
              <p className="max-w-48 text-xs leading-5 text-[var(--muted)]">Unpaid charges are lease-linked.</p>
            )}
          </div>
        </div>
        {!stripeReady ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Add the missing Stripe environment variables, restart dev, and Checkout will open from tenant payments.
          </div>
        ) : !managerConnect.ready ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Finish Stripe payout onboarding so tenant Checkout can route rent to the manager bank account.
          </div>
        ) : null}
      </Card>
      <section className="card-grid-compact">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Paid rent</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{paidPayments.length}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{formatCurrency(paidPayments.reduce((sum, payment) => sum + payment.amount, 0))} collected</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Unpaid rent</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{unpaidPayments.length}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{formatCurrency(unpaidPayments.reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0))} outstanding</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Stripe payments</p>
          <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{stripePayments.length}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Webhook reconciled checkout records</p>
        </Card>
      </section>
      <div className="content-split">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Rent ledger</p>
          <DataTable columns={["Description", "Unit", "Due", "Paid", "Channel", "Amount"]} className="mt-5">
            {portal.scope.payments.map((payment) => {
              const unit = portal.scope.units.find((item) => item.id === payment.unitId);
              const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;

              return (
                <tr key={payment.id} className="table-row">
                  <td className="py-4 pr-4 font-semibold">{payment.description}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{property?.name} {unit?.unitNumber}</td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{formatDate(payment.dueDate)}</td>
                  <td className="py-4 pr-4"><Badge tone={badgeToneFromPayment(payment.status)}>{payment.status === "PAID" ? "Paid" : "Unpaid"}</Badge></td>
                  <td className="py-4 pr-4 text-[var(--muted)]">{payment.stripeCheckoutSessionId ? "Stripe" : "Manual"}</td>
                  <td className="py-4 pr-4 text-right font-semibold">{formatCurrency(payment.amount)}</td>
                </tr>
              );
            })}
          </DataTable>
        </Card>
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Create rent request</p>
          <form action={createPaymentAction} className="mt-6 space-y-4">
            <select name="unitId" className="field">
              {portal.scope.units.map((unit) => {
                const property = portal.scope.properties.find((item) => item.id === unit.propertyId);
                return <option key={unit.id} value={unit.id}>{property?.name} {unit.unitNumber}</option>;
              })}
            </select>
            <select name="leaseId" className="field">
              <option value="">Auto-link active lease for unit</option>
              {portal.scope.leases.map((lease) => {
                const unit = portal.scope.units.find((item) => item.id === lease.unitId);
                const tenant = portal.scope.tenants.find((item) => lease.tenantIds.includes(item.id));
                return (
                  <option key={lease.id} value={lease.id}>
                    {lease.nexusLeaseId ?? lease.id} - Unit {unit?.unitNumber ?? "unassigned"} {tenant ? `- ${tenant.firstName} ${tenant.lastName}` : ""}
                  </option>
                );
              })}
            </select>
            <input name="description" placeholder="Description" className="field" />
            <div className="form-grid-2">
              <input name="amount" type="number" step="0.01" placeholder="Amount" className="field" />
              <input name="dueDate" type="date" className="field" />
            </div>
            <div className="form-grid-2">
              <input name="paidDate" type="date" className="field" />
              <select name="status" className="field">
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partial</option>
                <option value="LATE">Late</option>
              </select>
            </div>
            <div className="form-grid-2">
              <input name="lateFeeAmount" type="number" step="0.01" placeholder="Late fee" className="field" />
              <input name="balanceDue" type="number" step="0.01" placeholder="Balance due" className="field" />
            </div>
            <input name="categoryTag" placeholder="Category/tag" className="field" />
            <SubmitButton>
              <Send className="h-4 w-4" />
              Send rent request
            </SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
