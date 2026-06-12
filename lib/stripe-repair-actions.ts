"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRoles } from "@/lib/auth";
import { hasAcceptedCurrentPaymentTerms } from "@/lib/legal";
import { recordPlatformEvent } from "@/lib/platform-events";
import { getAppBaseUrl } from "@/lib/request-origin";
import { UserRole } from "@/lib/store";
import {
  attachVerifiedStripeAccount,
  clearManagerStripeConnection,
  createManagerConnectedAccount,
  createManagerOnboardingLink,
  getStripeAccountId,
  verifyAndSyncStoredStripeAccount,
  type StripeOwnershipVerification
} from "@/lib/stripe-connect";

const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]+$/;

function settingsStripeUrl(status: string, reason?: string) {
  return `/settings?stripe=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}#payments-stripe`;
}

async function recordMismatchDetected(
  user: { id: string; organizationId: string },
  verification: StripeOwnershipVerification,
  category: string
) {
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

// Repair option A: re-verify and re-sync the currently stored account. Refuses
// (and keeps the stored ID for diagnostics) when the account's metadata belongs
// to a different Nexus user or organization.
export async function resyncStripeAccountAction() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);

  if (!getStripeAccountId(user)) {
    redirect(settingsStripeUrl("connect-required"));
  }

  let result;
  try {
    result = await verifyAndSyncStoredStripeAccount(user);
  } catch (error) {
    console.error("[stripe-repair] Re-sync failed", {
      userId: user.id,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect(settingsStripeUrl("connect-error"));
  }

  if (!result) {
    redirect(settingsStripeUrl("connect-required"));
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  if (!result.verification.valid) {
    await recordMismatchDetected(user, result.verification, "repair_resync");
    redirect(settingsStripeUrl("resync-blocked", result.verification.reason));
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
  redirect(settingsStripeUrl(result.metadataBackfilled ? "resync-metadata-repaired" : "resync-ok"));
}

// Repair option B: manually attach an account ID. The account is always
// retrieved from Stripe and its metadata must map to this exact user and
// organization — managers can never claim another user's account.
export async function attachStripeAccountAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const accountId = String(formData.get("accountId") ?? "").trim();

  if (!STRIPE_ACCOUNT_ID_PATTERN.test(accountId)) {
    redirect(settingsStripeUrl("attach-invalid-id"));
  }

  let verification: StripeOwnershipVerification;
  try {
    verification = await attachVerifiedStripeAccount(user, accountId);
  } catch (error) {
    console.error("[stripe-repair] Manual attach failed", {
      userId: user.id,
      accountId,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect(settingsStripeUrl("connect-error"));
  }

  if (!verification.valid) {
    await recordMismatchDetected(user, verification, "repair_manual_attach");
    redirect(settingsStripeUrl("attach-blocked", verification.reason));
  }

  await recordPlatformEvent({
    type: "STRIPE_ACCOUNT_REPAIRED",
    category: "repair_manual_attach",
    status: "success",
    organizationId: user.organizationId,
    userId: user.id,
    relatedId: accountId,
    message: "Stripe connected account manually attached after ownership verification.",
    metadata: { accountId }
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  redirect(settingsStripeUrl("attach-success"));
}

// Repair option C: start fresh. Clears the stored account ID (only with
// explicit confirmation) and starts new Connect onboarding. The old Stripe
// account is never deleted in Stripe and payment records are not touched.
export async function reconnectStripeAccountAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);

  if (formData.get("confirmReconnect") !== "on") {
    redirect(settingsStripeUrl("reconnect-confirm-required"));
  }
  if (!hasAcceptedCurrentPaymentTerms(user)) {
    redirect(settingsStripeUrl("payment-terms-required"));
  }

  const previousAccountId = getStripeAccountId(user);
  let onboardingUrl: string | null = null;

  try {
    if (previousAccountId) {
      await clearManagerStripeConnection(user.id);
    }
    await recordPlatformEvent({
      type: "STRIPE_ACCOUNT_RECONNECT_STARTED",
      category: "repair_reconnect",
      status: "info",
      organizationId: user.organizationId,
      userId: user.id,
      relatedId: previousAccountId,
      message: "Manager started a fresh Stripe Connect onboarding from the repair flow.",
      metadata: { previousAccountId: previousAccountId ?? null }
    });
    // createManagerConnectedAccount stamps metadata with userId, organizationId
    // and source: nexus_manager_payouts.
    const account = await createManagerConnectedAccount(user);
    onboardingUrl = await createManagerOnboardingLink(account.id, getAppBaseUrl());
  } catch (error) {
    console.error("[stripe-repair] Reconnect failed", {
      userId: user.id,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect(settingsStripeUrl("connect-error"));
  }

  if (!onboardingUrl) {
    redirect(settingsStripeUrl("connect-error"));
  }
  redirect(onboardingUrl);
}
