"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSystemAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendAdminTestEmail } from "@/lib/email";
import { recordPlatformEvent } from "@/lib/platform-events";
import {
  attachVerifiedStripeAccount,
  clearManagerStripeConnection,
  syncManagerConnectedAccount,
  verifyStripeConnectedAccountOwnership,
  type StripeOwnershipVerification
} from "@/lib/stripe-connect";
import { getUserById, readStore } from "@/lib/store";

export async function sendAdminTestEmailAction() {
  const admin = await requireSystemAdmin();
  let failureMessage: string | null = null;

  try {
    const result = await sendAdminTestEmail(admin.email, admin.organizationId, admin.id);
    if (!result.sent) {
      failureMessage = result.error ?? "Email was not accepted.";
    }
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : "Email delivery failed.";
  }

  if (failureMessage) {
    redirect(`/admin/email?test=failed&message=${encodeURIComponent(failureMessage)}`);
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?test=sent");
}

export async function resetManagerStripeConnectAction(formData: FormData) {
  await requireSystemAdmin();
  const managerId = String(formData.get("managerId") ?? "");
  const manager = managerId ? await getUserById(managerId) : null;

  if (!manager || manager.role === "TENANT") {
    redirect("/admin/stripe?reset=invalid");
  }

  console.log("[admin] Resetting Stripe Connect for manager", { managerId: manager.id, email: manager.email });

  await db.user.update({
    where: { id: manager.id },
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

  console.log("[admin] Stripe Connect reset complete", { managerId: manager.id, email: manager.email });

  revalidatePath("/admin/stripe");
  revalidatePath("/settings");
  redirect(`/admin/stripe?reset=success&resetManager=${encodeURIComponent(manager.email)}`);
}

// System-admin-only repair: reassign a connected account whose Stripe metadata
// maps to this manager's organization but a different Nexus user. The flow is
// two-phase — the first submit (without the confirmation checkbox) verifies the
// account and redirects to a preview showing the stored userId next to the
// Stripe metadata userId; the admin must re-submit with the explicit
// confirmation checked before anything is changed. Cross-organization metadata
// is always refused. Normal managers cannot reach this action.
export async function adminRepairStripeAccountAction(formData: FormData) {
  const admin = await requireSystemAdmin();
  const managerId = String(formData.get("managerId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const confirmed = formData.get("confirmRepair") === "on";

  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    redirect("/admin/stripe?repair=invalid-id");
  }

  const manager = managerId ? await getUserById(managerId) : null;
  if (!manager || manager.role === "TENANT") {
    redirect("/admin/stripe?repair=manager-missing");
  }

  let verification: StripeOwnershipVerification;
  try {
    verification = await verifyStripeConnectedAccountOwnership({
      accountId,
      expectedUserId: manager.id,
      expectedOrganizationId: manager.organizationId,
      allowUserMismatch: true
    });
  } catch (error) {
    console.error("[admin] Stripe repair verification failed", {
      adminId: admin.id,
      managerId: manager.id,
      accountId,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect("/admin/stripe?repair=error");
  }

  if (!verification.valid) {
    await recordPlatformEvent({
      type: "STRIPE_ACCOUNT_MISMATCH_DETECTED",
      category: "admin_repair",
      status: "blocked",
      organizationId: manager.organizationId,
      userId: admin.id,
      relatedId: accountId,
      message: `System admin Stripe repair refused: ${verification.reason}.`,
      metadata: {
        accountId,
        managerId: manager.id,
        reason: verification.reason,
        stripeUserIdMetadata: verification.stripeUserIdMetadata ?? null,
        stripeOrganizationIdMetadata: verification.stripeOrganizationIdMetadata ?? null
      }
    });
    redirect(`/admin/stripe?repair=blocked&reason=${encodeURIComponent(verification.reason)}`);
  }

  if (!confirmed) {
    const preview = new URLSearchParams({
      repair: "confirm",
      manager: manager.id,
      account: accountId,
      storedUser: manager.id,
      metadataUser: verification.stripeUserIdMetadata ?? "missing"
    });
    redirect(`/admin/stripe?${preview.toString()}`);
  }

  // Prevent double payout routing: any other local user still storing this
  // account ID is detached (their Connect fields are cleared; nothing is
  // deleted in Stripe and payment records are untouched).
  const store = await readStore();
  const otherOwners = store.users.filter(
    (candidate) =>
      candidate.id !== manager.id &&
      (candidate.stripeAccountId === accountId || candidate.stripeConnectedAccountId === accountId)
  );

  try {
    for (const other of otherOwners) {
      await clearManagerStripeConnection(other.id);
    }
    const attached = await attachVerifiedStripeAccount(manager, accountId, { allowUserMismatch: true });
    if (!attached.valid) {
      redirect(`/admin/stripe?repair=blocked&reason=${encodeURIComponent(attached.reason)}`);
    }
  } catch (error) {
    if ((error as { digest?: string })?.digest?.toString().startsWith("NEXT_REDIRECT")) throw error;
    console.error("[admin] Stripe repair attach failed", {
      adminId: admin.id,
      managerId: manager.id,
      accountId,
      error: error instanceof Error ? error.name : "unknown"
    });
    redirect("/admin/stripe?repair=error");
  }

  await recordPlatformEvent({
    type: "STRIPE_ADMIN_OVERRIDE_USED",
    category: "admin_repair",
    status: "success",
    organizationId: manager.organizationId,
    userId: admin.id,
    relatedId: accountId,
    message: "System admin reassigned a same-organization Stripe connected account.",
    metadata: {
      accountId,
      managerId: manager.id,
      previousMetadataUserId: verification.stripeUserIdMetadata ?? null,
      detachedFromUserIds: otherOwners.length ? otherOwners.map((other) => other.id).join(",") : null,
      confirmation: "I understand this changes payout routing for this organization."
    }
  });

  revalidatePath("/admin/stripe");
  revalidatePath("/settings");
  redirect(`/admin/stripe?repair=success&manager=${encodeURIComponent(manager.id)}&account=${encodeURIComponent(accountId)}`);
}

export async function refreshManagerStripeAction(formData: FormData) {
  await requireSystemAdmin();
  const managerId = String(formData.get("managerId") ?? "");
  const manager = managerId ? await getUserById(managerId) : null;

  if (!manager) {
    redirect("/admin/stripe?refresh=missing");
  }

  try {
    await syncManagerConnectedAccount(manager);
  } catch (error) {
    redirect(
      `/admin/stripe?refresh=failed&message=${encodeURIComponent(
        error instanceof Error ? error.message : "Stripe refresh failed."
      )}`
    );
  }

  revalidatePath("/admin/stripe");
  revalidatePath(`/admin/managers/${manager.id}`);
  redirect(`/admin/stripe?refresh=success&manager=${encodeURIComponent(manager.id)}`);
}
