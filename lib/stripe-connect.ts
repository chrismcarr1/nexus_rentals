import "server-only";

import type Stripe from "stripe";

import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type { User } from "@/lib/store";

type StripeManagerUser = Pick<User, "id" | "organizationId" | "email" | "firstName" | "lastName" | "stripeAccountId" | "stripeConnectedAccountId">;
type StripeConnectUser = Pick<
  User,
  | "id"
  | "stripeAccountId"
  | "stripeConnectedAccountId"
  | "stripeChargesEnabled"
  | "stripePayoutsEnabled"
  | "stripeDetailsSubmitted"
  | "stripeOnboardingComplete"
  | "stripeDisabledReason"
  | "stripeCurrentlyDue"
  | "stripeEventuallyDue"
>;

export function getStripeAccountId(user?: Pick<User, "stripeAccountId" | "stripeConnectedAccountId"> | null) {
  return user?.stripeConnectedAccountId ?? user?.stripeAccountId;
}

export function isStripeConnectReady(user?: StripeConnectUser | null) {
  return Boolean(getStripeAccountId(user) && user?.stripeChargesEnabled && user.stripePayoutsEnabled && user.stripeOnboardingComplete);
}

export function getStripeConnectState(user?: StripeConnectUser | null) {
  const accountId = getStripeAccountId(user);
  if (!accountId) {
    return {
      key: "not_started" as const,
      label: "Setup required",
      detail: "No connected Stripe account has been created.",
      actionLabel: "Set up Stripe payouts",
      ready: false,
      tone: "warning" as const
    };
  }
  if (isStripeConnectReady(user)) {
    return {
      key: "ready" as const,
      label: "Stripe connected",
      detail: "Charges and payouts are enabled.",
      actionLabel: "Stripe dashboard",
      ready: true,
      tone: "success" as const
    };
  }
  if (user?.stripeDetailsSubmitted && !user.stripePayoutsEnabled) {
    return {
      key: "pending_review" as const,
      label: "Submitted, pending Stripe review",
      detail: user.stripeDisabledReason ? `Stripe review status: ${user.stripeDisabledReason}` : "Stripe has the submitted details and has not enabled payouts yet.",
      actionLabel: "Continue Stripe setup",
      ready: false,
      tone: "warning" as const
    };
  }
  return {
    key: "continue_setup" as const,
    label: "Continue setup",
    detail: "The connected account exists, but onboarding details are not complete.",
    actionLabel: "Continue Stripe setup",
    ready: false,
    tone: "warning" as const
  };
}

export function getStripeConnectRedirectStatus(user?: StripeConnectUser | null) {
  const state = getStripeConnectState(user);
  if (state.key === "ready") return "connect-ready";
  if (state.key === "pending_review") return "connect-pending-review";
  if (state.key === "continue_setup") return "connect-continue-setup";
  return "connect-required";
}

function getStripeAccountStatus(account: Stripe.Account) {
  const requirements = account.requirements;
  return {
    stripeAccountId: account.id,
    stripeConnectedAccountId: account.id,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeOnboardingComplete: Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted),
    stripeDisabledReason: requirements?.disabled_reason ?? undefined,
    stripeCurrentlyDue: requirements?.currently_due ?? [],
    stripeEventuallyDue: requirements?.eventually_due ?? [],
    stripeUpdatedAt: new Date().toISOString()
  };
}

export async function saveStripeAccountStatus(userId: string, account: Stripe.Account) {
  const data = getStripeAccountStatus(account);
  console.log("[stripe-connect] Saving connected account status", {
    userId,
    accountId: account.id,
    detailsSubmitted: data.stripeDetailsSubmitted,
    chargesEnabled: data.stripeChargesEnabled,
    payoutsEnabled: data.stripePayoutsEnabled,
    disabledReason: data.stripeDisabledReason,
    currentlyDue: data.stripeCurrentlyDue,
    eventuallyDue: data.stripeEventuallyDue
  });
  return db.user.update({
    where: { id: userId },
    data
  });
}

export async function syncStripeConnectedAccount(user: Pick<User, "id" | "stripeAccountId" | "stripeConnectedAccountId">) {
  const accountId = getStripeAccountId(user);
  if (!accountId) return null;

  console.log("[stripe-connect] Retrieving connected account", { userId: user.id, accountId });
  const account = await getStripe().accounts.retrieve(accountId);
  if ((account as unknown as { deleted?: boolean }).deleted === true) {
    console.log("[stripe-connect] Connected account was deleted in Stripe; clearing local status", { userId: user.id, accountId });
    await db.user.update({
      where: { id: user.id },
      data: {
        stripeAccountId: undefined,
        stripeConnectedAccountId: undefined,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: false,
        stripeOnboardingComplete: false,
        stripeDisabledReason: undefined,
        stripeCurrentlyDue: [],
        stripeEventuallyDue: [],
        stripeUpdatedAt: new Date().toISOString()
      }
    });
    return null;
  }

  const stripeAccount = account as Stripe.Account;
  console.log("[stripe-connect] Retrieved connected account status", {
    userId: user.id,
    accountId: stripeAccount.id,
    detailsSubmitted: stripeAccount.details_submitted,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
    disabledReason: stripeAccount.requirements?.disabled_reason,
    currentlyDue: stripeAccount.requirements?.currently_due,
    eventuallyDue: stripeAccount.requirements?.eventually_due
  });
  return saveStripeAccountStatus(user.id, account as Stripe.Account);
}

export async function createStripeExpressAccount(user: StripeManagerUser) {
  console.log("[stripe-connect] Creating Stripe Express account", { userId: user.id, organizationId: user.organizationId, email: user.email });
  const account = await getStripe().accounts.create({
    type: "express",
    country: "US",
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    business_profile: {
      name: `${user.firstName} ${user.lastName}`.trim() || "Nexus Rentals manager"
    },
    metadata: {
      source: "nexus_manager_payouts",
      userId: user.id,
      organizationId: user.organizationId
    }
  });

  console.log("[stripe-connect] Created Stripe Express account", { userId: user.id, accountId: account.id });
  await saveStripeAccountStatus(user.id, account);
  console.log("[stripe-connect] Saved new Stripe account id to user", { userId: user.id, accountId: account.id });
  return account;
}
