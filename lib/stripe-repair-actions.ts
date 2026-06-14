"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { PAYMENT_TERMS_VERSION, hasAcceptedCurrentPaymentTerms } from "@/lib/legal";
import { recordPlatformEvent } from "@/lib/platform-events";
import { getAppBaseUrl } from "@/lib/request-origin";
import { UserRole } from "@/lib/store";
import {
  attachVerifiedStripeAccount,
  createManagerConnectedAccount,
  createManagerOnboardingLink,
  getStripeAccountId,
  verifyAndSyncStoredStripeAccount,
  type StripeOwnershipReason,
  type StripeOwnershipVerification
} from "@/lib/stripe-connect";

const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]+$/;

// Repair outcomes use a fixed, explicit status vocabulary so the settings page
// can always tell the manager exactly what happened:
//   repair-success | repair-rejected-user-mismatch | repair-rejected-org-mismatch
//   repair-invalid-account | resync-success | reconnect-started
//   reconnect-confirmation-required | repair-error
function settingsStripeUrl(status: string, params?: { reason?: string; account?: string }) {
  const query = new URLSearchParams({ stripe: status });
  if (params?.reason) query.set("reason", params.reason);
  if (params?.account) query.set("account", params.account);
  return `/settings?${query.toString()}#payments-stripe`;
}

function repairStatusForReason(reason: StripeOwnershipReason): string {
  if (reason === "metadata-user-mismatch") return "repair-rejected-user-mismatch";
  if (reason === "metadata-organization-mismatch") return "repair-rejected-org-mismatch";
  if (reason === "stripe-config" || reason === "stripe-error") return "repair-error";
  // metadata-missing, account-not-found, account-deleted
  return "repair-invalid-account";
}

// Ownership facts only; configuration/transient failures are not mismatches
// and must not pollute the mismatch audit trail.
const MISMATCH_EVENT_REASONS: ReadonlySet<string> = new Set([
  "metadata-user-mismatch",
  "metadata-organization-mismatch",
  "metadata-missing",
  "account-not-found",
  "account-deleted"
]);

async function recordMismatchDetected(
  user: { id: string; organizationId: string },
  verification: StripeOwnershipVerification,
  category: string
) {
  if (!MISMATCH_EVENT_REASONS.has(verification.reason)) return;
  await recordPlatformEvent({
    type: "STRIPE_ACCOUNT_MISMATCH_DETECTED",
    category,
    status: "blocked",
    organizationId: user.organizationId,
    userId: user.id,
    relatedId: verification.accountId,
    message: `Stripe connected account ownership check failed: ${verification.reason}.`,
    metadata: {
      accountId: verification.accountId,
      reason: verification.reason,
      stripeUserIdMetadata: verification.stripeUserIdMetadata ?? null,
      stripeOrganizationIdMetadata: verification.stripeOrganizationIdMetadata ?? null
    }
  });
}

// Temporary debug logging while the repair flow is being stabilized: IDs and
// derived outcomes only — never secrets, raw Stripe payloads, or bank details.
function logRepairStep(action: string, step: string, detail: Record<string, string | boolean | null | undefined>) {
  console.log(`[stripe-repair] ${action}: ${step}`, detail);
}

// Payment terms gate, mirrored from lib/actions.ts ensurePaymentTermsAccepted:
// any form that can start Stripe money movement either records the inline
// acknowledgement or bounces with payment-terms-required.
async function ensureRepairPaymentTermsAccepted(
  user: { id: string; paymentTermsAcceptedAt?: string; paymentTermsVersionAccepted?: string },
  formData: FormData
) {
  if (hasAcceptedCurrentPaymentTerms(user)) return true;
  if (formData.get("acceptPaymentTerms") !== "on") return false;
  await db.user.update({
    where: { id: user.id },
    data: { paymentTermsAcceptedAt: new Date().toISOString(), paymentTermsVersionAccepted: PAYMENT_TERMS_VERSION }
  });
  return true;
}

// Repair option A: re-verify and re-sync the currently stored account. Refuses
// (and keeps the stored ID for diagnostics) when the account's metadata belongs
// to a different Nexus user or organization.
export async function resyncStripeAccountAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const storedAccountId = getStripeAccountId(user);
  logRepairStep("resync", "entered", {
    userId: user.id,
    organizationId: user.organizationId,
    storedAccountIdBefore: storedAccountId ?? null
  });

  if (!storedAccountId) {
    redirect(settingsStripeUrl("connect-required"));
  }

  let result;
  try {
    result = await verifyAndSyncStoredStripeAccount(user);
  } catch (error) {
    console.error("[stripe-repair] resync: failed", {
      userId: user.id,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect(settingsStripeUrl("repair-error", { account: storedAccountId }));
  }

  if (!result) {
    redirect(settingsStripeUrl("connect-required"));
  }

  logRepairStep("resync", "verification result", {
    userId: user.id,
    accountId: result.verification.accountId,
    valid: result.verification.valid,
    reason: result.verification.reason,
    metadataBackfilled: result.metadataBackfilled
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  if (!result.verification.valid) {
    await recordMismatchDetected(user, result.verification, "repair_resync");
    const target = settingsStripeUrl(repairStatusForReason(result.verification.reason), {
      reason: result.verification.reason,
      account: storedAccountId
    });
    logRepairStep("resync", "refused", { userId: user.id, redirect: target });
    redirect(target);
  }

  await recordPlatformEvent({
    type: "STRIPE_ACCOUNT_RESYNCED",
    category: "repair_resync",
    status: "success",
    organizationId: user.organizationId,
    userId: user.id,
    relatedId: result.verification.accountId,
    message: result.metadataBackfilled
      ? "Stripe account re-synced; missing ownership metadata was backfilled from local state."
      : "Stripe account re-synced and ownership verified.",
    metadata: {
      accountId: result.verification.accountId,
      metadataBackfilled: result.metadataBackfilled
    }
  });
  const target = settingsStripeUrl("resync-success", {
    account: storedAccountId,
    ...(result.metadataBackfilled ? { reason: "metadata-backfilled" } : {})
  });
  logRepairStep("resync", "success", { userId: user.id, storedAccountIdAfter: storedAccountId, redirect: target });
  redirect(target);
}

// Repair option B: manually attach an account ID. The account is always
// retrieved from Stripe and its metadata must map to this exact user and
// organization — managers can never claim another user's account.
export async function attachStripeAccountAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const accountId = String(formData.get("accountId") ?? "").trim();
  const storedBefore = getStripeAccountId(user) ?? null;
  logRepairStep("attach", "entered", {
    userId: user.id,
    organizationId: user.organizationId,
    submittedAccountId: accountId,
    storedAccountIdBefore: storedBefore
  });

  if (!STRIPE_ACCOUNT_ID_PATTERN.test(accountId)) {
    logRepairStep("attach", "invalid account id format", { userId: user.id });
    redirect(settingsStripeUrl("repair-invalid-account", { reason: "invalid-id" }));
  }

  let verification: StripeOwnershipVerification;
  try {
    verification = await attachVerifiedStripeAccount(user, accountId);
  } catch (error) {
    console.error("[stripe-repair] attach: failed", {
      userId: user.id,
      accountId,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect(settingsStripeUrl("repair-error", { account: accountId }));
  }

  logRepairStep("attach", "verification result", {
    userId: user.id,
    accountId,
    valid: verification.valid,
    reason: verification.reason
  });

  if (!verification.valid) {
    await recordMismatchDetected(user, verification, "repair_manual_attach");
    const target = settingsStripeUrl(repairStatusForReason(verification.reason), {
      reason: verification.reason,
      account: accountId
    });
    logRepairStep("attach", "refused", { userId: user.id, redirect: target });
    redirect(target);
  }

  await recordPlatformEvent({
    type: "STRIPE_ACCOUNT_REPAIRED",
    category: "repair_manual_attach",
    status: "success",
    organizationId: user.organizationId,
    userId: user.id,
    relatedId: accountId,
    message: "Stripe connected account manually attached after ownership verification.",
    metadata: { accountId, previousAccountId: storedBefore }
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  const target = settingsStripeUrl("repair-success", { account: accountId });
  logRepairStep("attach", "success", { userId: user.id, storedAccountIdAfter: accountId, redirect: target });
  redirect(target);
}

// Repair option C: start fresh. Requires explicit confirmation. The new
// connected account is created FIRST (with userId/organizationId/source
// metadata) and saving its status replaces the old stored fields — so a Stripe
// failure leaves the previous connection untouched instead of half-cleared.
// The old Stripe account is never deleted in Stripe and payment records are
// not touched.
export async function reconnectStripeAccountAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const previousAccountId = getStripeAccountId(user) ?? null;
  logRepairStep("reconnect", "entered", {
    userId: user.id,
    organizationId: user.organizationId,
    storedAccountIdBefore: previousAccountId
  });

  if (formData.get("confirmReconnect") !== "on") {
    logRepairStep("reconnect", "confirmation missing", { userId: user.id });
    redirect(settingsStripeUrl("reconnect-confirmation-required"));
  }
  if (!(await ensureRepairPaymentTermsAccepted(user, formData))) {
    logRepairStep("reconnect", "payment terms not accepted", { userId: user.id });
    redirect(settingsStripeUrl("payment-terms-required"));
  }

  let onboardingUrl: string | null = null;
  let newAccountId: string | null = null;

  try {
    // createManagerConnectedAccount stamps metadata with userId, organizationId
    // and source: nexus_manager_payouts, and saving its status overwrites every
    // stored Stripe field — this is what clears the old connection.
    const account = await createManagerConnectedAccount(user);
    newAccountId = account.id;
    onboardingUrl = await createManagerOnboardingLink(account.id, getAppBaseUrl());
  } catch (error) {
    console.error("[stripe-repair] reconnect: failed; previous connection left untouched", {
      userId: user.id,
      previousAccountId,
      newAccountId,
      error: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message.slice(0, 200) : "unknown"
    });
    redirect(settingsStripeUrl("repair-error", { reason: "reconnect-failed" }));
  }

  await recordPlatformEvent({
    type: "STRIPE_ACCOUNT_RECONNECT_STARTED",
    category: "repair_reconnect",
    status: "info",
    organizationId: user.organizationId,
    userId: user.id,
    relatedId: newAccountId,
    message: "Manager started a fresh Stripe Connect onboarding from the repair flow.",
    metadata: { previousAccountId, newAccountId }
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  if (!onboardingUrl) {
    redirect(settingsStripeUrl("repair-error", { reason: "reconnect-failed" }));
  }
  logRepairStep("reconnect", "redirecting to Stripe onboarding", {
    userId: user.id,
    storedAccountIdAfter: newAccountId,
    redirect: "stripe-onboarding"
  });
  redirect(onboardingUrl);
}
