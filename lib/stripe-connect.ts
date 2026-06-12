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

export type StripeOwnershipReason =
  | "verified"
  | "account-not-found"
  | "account-deleted"
  | "metadata-missing"
  | "metadata-user-mismatch"
  | "metadata-organization-mismatch"
  | "stripe-error";

// Safe, loggable summary of a connected account's ownership check. Never put
// the full Stripe account object (bank/external account details) in here.
export type StripeOwnershipVerification = {
  valid: boolean;
  reason: StripeOwnershipReason;
  accountId: string;
  stripeUserIdMetadata?: string;
  stripeOrganizationIdMetadata?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  dashboardType?: string;
  disabledReason?: string;
};

type OwnershipExpectation = {
  expectedUserId: string;
  expectedOrganizationId: string;
  // System-admin override: a different metadata userId is tolerated as long as
  // the organization matches. Never set for normal manager flows.
  allowUserMismatch?: boolean;
};

function getAccountDashboardType(account: Stripe.Account) {
  return account.controller?.stripe_dashboard?.type ?? account.type ?? undefined;
}

function classifyAccountOwnership(account: Stripe.Account, expectation: OwnershipExpectation): StripeOwnershipReason {
  const metadataUserId = account.metadata?.userId;
  const metadataOrganizationId = account.metadata?.organizationId;
  if (!metadataUserId || !metadataOrganizationId) return "metadata-missing";
  if (metadataOrganizationId !== expectation.expectedOrganizationId) return "metadata-organization-mismatch";
  if (metadataUserId !== expectation.expectedUserId && !expectation.allowUserMismatch) return "metadata-user-mismatch";
  return "verified";
}

function buildOwnershipVerification(
  accountId: string,
  account: Stripe.Account | null,
  reason: StripeOwnershipReason
): StripeOwnershipVerification {
  return {
    valid: reason === "verified",
    reason,
    accountId,
    stripeUserIdMetadata: account?.metadata?.userId ?? undefined,
    stripeOrganizationIdMetadata: account?.metadata?.organizationId ?? undefined,
    chargesEnabled: Boolean(account?.charges_enabled),
    payoutsEnabled: Boolean(account?.payouts_enabled),
    detailsSubmitted: Boolean(account?.details_submitted),
    dashboardType: account ? getAccountDashboardType(account) : undefined,
    disabledReason: account?.requirements?.disabled_reason ?? undefined
  };
}

async function retrieveAccountForOwnership(accountId: string): Promise<
  { account: Stripe.Account; failure?: never } | { account: null; failure: StripeOwnershipReason }
> {
  try {
    const retrieved = await getStripe().accounts.retrieve(accountId);
    if ((retrieved as unknown as { deleted?: boolean }).deleted === true) {
      return { account: null, failure: "account-deleted" };
    }
    return { account: retrieved as Stripe.Account };
  } catch (error) {
    console.error("[stripe-connect] Could not retrieve account for ownership check", {
      accountId,
      ...safeStripeErrorDiagnostic(error)
    });
    return { account: null, failure: isStripeMissingAccountError(error) ? "account-not-found" : "stripe-error" };
  }
}

// Retrieves the connected account with the platform key and checks that its
// metadata maps to the expected Nexus user and organization. Returns a safe
// summary only; never the raw account.
export async function verifyStripeConnectedAccountOwnership(params: {
  accountId: string;
  expectedUserId: string;
  expectedOrganizationId: string;
  allowUserMismatch?: boolean;
}): Promise<StripeOwnershipVerification> {
  const { account, failure } = await retrieveAccountForOwnership(params.accountId);
  if (!account) {
    return buildOwnershipVerification(params.accountId, null, failure);
  }
  return buildOwnershipVerification(params.accountId, account, classifyAccountOwnership(account, params));
}

function buildAccountStatus(account: Stripe.Account, ownership?: OwnershipExpectation) {
  const req = account.requirements;
  const ownershipReason = ownership ? classifyAccountOwnership(account, ownership) : null;
  const data: Partial<User> = {
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
    stripeUpdatedAt: new Date().toISOString(),
    stripeDashboardType: getAccountDashboardType(account),
    stripeMetadataUserId: account.metadata?.userId ?? undefined,
    stripeMetadataOrganizationId: account.metadata?.organizationId ?? undefined
  };
  if (ownershipReason) {
    data.stripeMetadataVerifiedAt = ownershipReason === "verified" ? new Date().toISOString() : undefined;
    data.stripeMetadataMismatchReason = ownershipReason === "verified" ? undefined : ownershipReason;
  }
  return data;
}

export async function saveStripeAccountStatus(userId: string, account: Stripe.Account, ownership?: OwnershipExpectation) {
  const data = buildAccountStatus(account, ownership);
  console.log("[stripe-connect] Saving account status", {
    userId,
    accountId: account.id,
    chargesEnabled: data.stripeChargesEnabled,
    payoutsEnabled: data.stripePayoutsEnabled,
    detailsSubmitted: data.stripeDetailsSubmitted,
    disabledReason: data.stripeDisabledReason,
    metadataMismatchReason: data.stripeMetadataMismatchReason
  });
  return db.user.update({ where: { id: userId }, data });
}

// Records a detected ownership mismatch on the manager record without touching
// the stored account ID, so the problem stays visible until it is repaired.
export async function markManagerStripeMismatch(managerId: string, reason: StripeOwnershipReason) {
  return db.user.update({
    where: { id: managerId },
    data: { stripeMetadataVerifiedAt: undefined, stripeMetadataMismatchReason: reason }
  });
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
      stripeUpdatedAt: undefined,
      stripeDashboardType: undefined,
      stripeMetadataUserId: undefined,
      stripeMetadataOrganizationId: undefined,
      stripeMetadataVerifiedAt: undefined,
      stripeMetadataMismatchReason: undefined
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
  try {
    assertManagerOwnsStripeAccount(user, stripeAccount);
  } catch (error) {
    // Persist the mismatch so settings/admin views keep showing it after the
    // failed sync, then rethrow so callers still fail closed.
    await markManagerStripeMismatch(
      user.id,
      classifyAccountOwnership(stripeAccount, { expectedUserId: user.id, expectedOrganizationId: user.organizationId })
    );
    throw error;
  }
  console.log("[stripe-connect] Account retrieved", {
    userId: user.id,
    accountId: stripeAccount.id,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
    detailsSubmitted: stripeAccount.details_submitted,
    disabledReason: stripeAccount.requirements?.disabled_reason
  });
  return saveStripeAccountStatus(user.id, stripeAccount, {
    expectedUserId: user.id,
    expectedOrganizationId: user.organizationId
  });
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
  await saveStripeAccountStatus(manager.id, account, {
    expectedUserId: manager.id,
    expectedOrganizationId: manager.organizationId
  });
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
  await saveStripeAccountStatus(manager.id, account, {
    expectedUserId: manager.id,
    expectedOrganizationId: manager.organizationId
  });

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

// Safe metadata backfill is only allowed when nothing about the account
// conflicts with the local record it is already attached to: every metadata
// field that IS present must already match the manager. A fully foreign or
// conflicting account can never be claimed this way.
function canSafelyBackfillMetadata(user: Pick<User, "id" | "organizationId">, account: Stripe.Account) {
  const metadataUserId = account.metadata?.userId;
  const metadataOrganizationId = account.metadata?.organizationId;
  if (metadataUserId && metadataOrganizationId) return false; // nothing missing
  if (metadataUserId && metadataUserId !== user.id) return false;
  if (metadataOrganizationId && metadataOrganizationId !== user.organizationId) return false;
  return true;
}

async function writeAccountOwnershipMetadata(accountId: string, user: Pick<User, "id" | "organizationId">) {
  return getStripe().accounts.update(accountId, {
    metadata: {
      source: "nexus_manager_payouts",
      userId: user.id,
      organizationId: user.organizationId
    }
  });
}

export type StoredAccountSyncResult = {
  verification: StripeOwnershipVerification;
  metadataBackfilled: boolean;
};

// Repair option A: re-verify the currently stored account. If the metadata is
// valid for this manager, local status fields are refreshed. If metadata is
// entirely absent but the account is already attached to this manager locally
// (i.e. it was created through Nexus before metadata stamping), the metadata is
// backfilled from local state. Any conflicting metadata refuses and records the
// mismatch; the stored account ID is left in place so the problem stays visible.
export async function verifyAndSyncStoredStripeAccount(user: StripeAccountOwner): Promise<StoredAccountSyncResult | null> {
  const accountId = getStripeAccountId(user);
  if (!accountId) return null;

  const expectation = { expectedUserId: user.id, expectedOrganizationId: user.organizationId };
  const { account, failure } = await retrieveAccountForOwnership(accountId);
  if (!account) {
    if (failure !== "stripe-error") await markManagerStripeMismatch(user.id, failure);
    return { verification: buildOwnershipVerification(accountId, null, failure), metadataBackfilled: false };
  }

  let reason = classifyAccountOwnership(account, expectation);
  let syncedAccount = account;
  let metadataBackfilled = false;

  if (reason === "metadata-missing" && canSafelyBackfillMetadata(user, account)) {
    console.log("[stripe-connect] Backfilling missing ownership metadata on stored account", {
      userId: user.id,
      accountId
    });
    syncedAccount = await writeAccountOwnershipMetadata(accountId, user);
    reason = classifyAccountOwnership(syncedAccount, expectation);
    metadataBackfilled = true;
  }

  if (reason === "verified") {
    await saveStripeAccountStatus(user.id, syncedAccount, expectation);
  } else {
    await markManagerStripeMismatch(user.id, reason);
  }

  return { verification: buildOwnershipVerification(accountId, syncedAccount, reason), metadataBackfilled };
}

// Repair option B (and the system-admin override): attach a manually entered
// account ID after retrieving it from Stripe and verifying its metadata.
// Normal managers require an exact user + organization metadata match; the
// admin override tolerates a different userId within the same organization and
// rewrites the metadata userId so ownership is consistent afterwards.
export async function attachVerifiedStripeAccount(
  user: Pick<User, "id" | "organizationId">,
  accountId: string,
  options?: { allowUserMismatch?: boolean }
): Promise<StripeOwnershipVerification> {
  const expectation = {
    expectedUserId: user.id,
    expectedOrganizationId: user.organizationId,
    allowUserMismatch: options?.allowUserMismatch
  };
  const { account, failure } = await retrieveAccountForOwnership(accountId);
  if (!account) {
    return buildOwnershipVerification(accountId, null, failure);
  }

  const reason = classifyAccountOwnership(account, expectation);
  if (reason !== "verified") {
    return buildOwnershipVerification(accountId, account, reason);
  }

  let attachedAccount = account;
  if (options?.allowUserMismatch && account.metadata?.userId !== user.id) {
    // Same-organization admin repair: re-stamp the metadata userId so the
    // account maps to its new manager and strict checkout checks pass.
    attachedAccount = await writeAccountOwnershipMetadata(accountId, user);
  }

  await saveStripeAccountStatus(user.id, attachedAccount, {
    expectedUserId: user.id,
    expectedOrganizationId: user.organizationId
  });
  return buildOwnershipVerification(accountId, attachedAccount, "verified");
}

export type PayoutDestinationCheck = {
  ok: boolean;
  // blocked=true means "ownership mismatch — repair required"; blocked=false
  // with ok=false means "no usable account — normal setup-required handling".
  blocked: boolean;
  reason: StripeOwnershipReason | "account-missing" | null;
  user: User | null;
  accountId: string | null;
};

// Payout safety gate: called immediately before any checkout session is
// created. The stored account is retrieved fresh from Stripe and its metadata
// must map exactly to this manager and organization, otherwise checkout must
// fail closed (blocked=true means "ownership mismatch — repair required",
// blocked=false means "no usable account — normal setup-required handling").
export async function verifyManagerPayoutDestination(manager: StripeAccountOwner): Promise<PayoutDestinationCheck> {
  const accountId = getStripeAccountId(manager);
  if (!accountId) {
    return { ok: false, blocked: false, reason: "account-missing", user: null, accountId: null };
  }

  const expectation = { expectedUserId: manager.id, expectedOrganizationId: manager.organizationId };
  const { account, failure } = await retrieveAccountForOwnership(accountId);
  if (!account) {
    return { ok: false, blocked: false, reason: failure, user: null, accountId };
  }

  const reason = classifyAccountOwnership(account, expectation);
  if (reason !== "verified") {
    console.error("[stripe-connect] Payout destination ownership mismatch; blocking checkout", {
      managerId: manager.id,
      organizationId: manager.organizationId,
      accountId,
      reason
    });
    await markManagerStripeMismatch(manager.id, reason);
    return { ok: false, blocked: true, reason, user: null, accountId };
  }

  const updatedUser = await saveStripeAccountStatus(manager.id, account, expectation);
  return { ok: true, blocked: false, reason: null, user: updatedUser, accountId };
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
