import "server-only";

import type Stripe from "stripe";

import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type { User } from "@/lib/store";

type StripeManagerUser = Pick<User, "id" | "organizationId" | "email" | "firstName" | "lastName" | "stripeAccountId" | "stripeConnectedAccountId">;
type StripeAccountOwner = Pick<User, "id" | "organizationId" | "stripeAccountId" | "stripeConnectedAccountId">;
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
  | "stripePastDue"
>;

export type ManagerStripeAccessStatus =
  | "stripe-dashboard-unavailable"
  | "stripe-account-mismatch"
  | "reconnect-required"
  | "connect-error";

export type ManagerStripeAccessResult =
  | { ok: true; url: string; mode: "dashboard" | "onboarding" }
  | {
      ok: false;
      status: ManagerStripeAccessStatus;
      clearConnection: boolean;
      diagnostic: {
        name?: string;
        type?: string;
        code?: string;
        statusCode?: number;
      };
    };

type ManagerStripeAccessErrorCode = "account_missing" | "account_ownership_mismatch" | "dashboard_unavailable";

export class ManagerStripeAccessError extends Error {
  constructor(public readonly code: ManagerStripeAccessErrorCode, message: string) {
    super(message);
    this.name = "ManagerStripeAccessError";
  }
}

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
      detail: user.stripeDisabledReason
        ? `Stripe review status: ${user.stripeDisabledReason}`
        : "Stripe has the submitted details and has not enabled payouts yet.",
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

function buildAccountStatus(account: Stripe.Account) {
  const req = account.requirements;
  return {
    stripeAccountId: account.id,
    stripeConnectedAccountId: account.id,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeOnboardingComplete: Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted),
    stripeDisabledReason: req?.disabled_reason ?? undefined,
    stripeCurrentlyDue: req?.currently_due ?? [],
    stripeEventuallyDue: req?.eventually_due ?? [],
    stripePastDue: req?.past_due ?? [],
    stripeUpdatedAt: new Date().toISOString()
  };
}

export async function saveStripeAccountStatus(userId: string, account: Stripe.Account) {
  const data = buildAccountStatus(account);
  console.log("[stripe-connect] Saving account status", {
    userId,
    accountId: account.id,
    chargesEnabled: data.stripeChargesEnabled,
    payoutsEnabled: data.stripePayoutsEnabled,
    detailsSubmitted: data.stripeDetailsSubmitted,
    disabledReason: data.stripeDisabledReason
  });
  return db.user.update({ where: { id: userId }, data });
}

export async function clearManagerStripeConnection(managerId: string) {
  return db.user.update({
    where: { id: managerId },
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
      stripePastDue: [],
      stripeUpdatedAt: undefined
    }
  });
}

function assertManagerOwnsStripeAccount(user: StripeAccountOwner, account: Stripe.Account) {
  const metadataUserId = account.metadata?.userId;
  const metadataOrganizationId = account.metadata?.organizationId;
  if (
    (metadataUserId && metadataUserId !== user.id) ||
    (metadataOrganizationId && metadataOrganizationId !== user.organizationId)
  ) {
    throw new ManagerStripeAccessError(
      "account_ownership_mismatch",
      "The connected Stripe account does not belong to this manager organization."
    );
  }
}

function hasExpressDashboardAccess(account: Stripe.Account) {
  const dashboardType = account.controller?.stripe_dashboard?.type;
  return dashboardType ? dashboardType === "express" : account.type === "express";
}

function safeStripeErrorDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const stripeError = error as {
    name?: unknown;
    type?: unknown;
    code?: unknown;
    statusCode?: unknown;
  };
  return {
    ...(typeof stripeError.name === "string" ? { name: stripeError.name } : {}),
    ...(typeof stripeError.type === "string" ? { type: stripeError.type } : {}),
    ...(typeof stripeError.code === "string" ? { code: stripeError.code } : {}),
    ...(typeof stripeError.statusCode === "number" ? { statusCode: stripeError.statusCode } : {})
  };
}

function isStripeMissingAccountError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const stripeError = error as { code?: unknown; statusCode?: unknown; message?: unknown };
  return (
    stripeError.statusCode === 404 ||
    stripeError.code === "resource_missing" ||
    (typeof stripeError.message === "string" && stripeError.message.toLowerCase().includes("no such account"))
  );
}

export function getManagerStripeAccessStatus(error: unknown): ManagerStripeAccessStatus {
  if (error instanceof ManagerStripeAccessError) {
    if (error.code === "account_missing") return "reconnect-required";
    if (error.code === "account_ownership_mismatch") return "stripe-account-mismatch";
    return "stripe-dashboard-unavailable";
  }
  if (isStripeMissingAccountError(error)) return "reconnect-required";
  if (
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 400
  ) {
    return "stripe-dashboard-unavailable";
  }
  return "connect-error";
}

export async function syncManagerConnectedAccount(user: StripeAccountOwner) {
  const accountId = getStripeAccountId(user);
  if (!accountId) return null;

  console.log("[stripe-connect] Syncing connected account", { userId: user.id, accountId });
  const account = await getStripe().accounts.retrieve(accountId);

  if ((account as unknown as { deleted?: boolean }).deleted === true) {
    console.log("[stripe-connect] Account deleted in Stripe; clearing local fields", { userId: user.id, accountId });
    await clearManagerStripeConnection(user.id);
    return null;
  }

  const stripeAccount = account as Stripe.Account;
  assertManagerOwnsStripeAccount(user, stripeAccount);
  console.log("[stripe-connect] Account retrieved", {
    userId: user.id,
    accountId: stripeAccount.id,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
    detailsSubmitted: stripeAccount.details_submitted,
    disabledReason: stripeAccount.requirements?.disabled_reason
  });
  return saveStripeAccountStatus(user.id, stripeAccount);
}

export async function createManagerConnectedAccount(manager: StripeManagerUser) {
  console.log("[stripe-connect] Creating Express connected account", { userId: manager.id });
  const account = await getStripe().accounts.create({
    type: "express",
    country: "US",
    email: manager.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    business_profile: {
      name: `${manager.firstName} ${manager.lastName}`.trim() || "Nexus Rentals manager"
    },
    metadata: {
      source: "nexus_manager_payouts",
      userId: manager.id,
      organizationId: manager.organizationId
    }
  });

  console.log("[stripe-connect] Express account created", { userId: manager.id, accountId: account.id });
  await saveStripeAccountStatus(manager.id, account);
  return account;
}

export async function createManagerOnboardingLink(accountId: string, appUrl: string) {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/settings?stripe=connect-refresh#payments-stripe`,
    return_url: `${appUrl}/api/stripe/connect/return`,
    type: "account_onboarding"
  });
  return link.url;
}

// Use only for accounts that have submitted onboarding details and have Express Dashboard access.
export async function createManagerDashboardLoginLink(accountId: string) {
  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
}

export async function createManagerStripeAccessLink(
  manager: StripeAccountOwner,
  appUrl: string
): Promise<{ url: string; mode: "dashboard" | "onboarding" }> {
  const accountId = getStripeAccountId(manager);
  if (!accountId) {
    throw new ManagerStripeAccessError("account_missing", "No connected Stripe account is available.");
  }

  const retrieved = await getStripe().accounts.retrieve(accountId);
  if ((retrieved as unknown as { deleted?: boolean }).deleted === true) {
    throw new ManagerStripeAccessError("account_missing", "The connected Stripe account is no longer available.");
  }

  const account = retrieved as Stripe.Account;
  assertManagerOwnsStripeAccount(manager, account);
  await saveStripeAccountStatus(manager.id, account);

  const needsOnboarding =
    !account.details_submitted ||
    (account.requirements?.currently_due?.length ?? 0) > 0;
  if (needsOnboarding) {
    return {
      url: await createManagerOnboardingLink(accountId, appUrl),
      mode: "onboarding"
    };
  }

  if (!hasExpressDashboardAccess(account)) {
    throw new ManagerStripeAccessError(
      "dashboard_unavailable",
      "This connected account does not support Express Dashboard login links."
    );
  }

  return {
    url: await createManagerDashboardLoginLink(accountId),
    mode: "dashboard"
  };
}

export async function getManagerStripeAccessResult(
  manager: StripeAccountOwner,
  appUrl: string
): Promise<ManagerStripeAccessResult> {
  try {
    const link = await createManagerStripeAccessLink(manager, appUrl);
    return { ok: true, ...link };
  } catch (error) {
    const status = getManagerStripeAccessStatus(error);
    return {
      ok: false,
      status,
      clearConnection: status === "reconnect-required" || status === "stripe-account-mismatch",
      diagnostic: safeStripeErrorDiagnostic(error)
    };
  }
}
