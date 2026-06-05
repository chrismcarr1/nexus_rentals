import { NextResponse } from "next/server";

import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { getStripeAccountId, getStripeConnectRedirectStatus, syncStripeConnectedAccount } from "@/lib/stripe-connect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const redirectUrl = new URL("/settings", request.url);
  let status = "connect-required";
  const accountId = getStripeAccountId(user);

  console.log("[stripe-connect] Onboarding return route hit", { userId: user.id, accountId });

  try {
    if (accountId) {
      const updatedUser = await syncStripeConnectedAccount(user);
      status = getStripeConnectRedirectStatus(updatedUser);
      console.log("[stripe-connect] Onboarding return status refreshed", {
        userId: user.id,
        accountId,
        status,
        chargesEnabled: Boolean(updatedUser?.stripeChargesEnabled),
        payoutsEnabled: Boolean(updatedUser?.stripePayoutsEnabled),
        detailsSubmitted: Boolean(updatedUser?.stripeDetailsSubmitted),
        disabledReason: updatedUser?.stripeDisabledReason,
        currentlyDue: updatedUser?.stripeCurrentlyDue,
        eventuallyDue: updatedUser?.stripeEventuallyDue
      });
    }
  } catch (error) {
    console.error("[stripe] Failed to refresh Connect status after onboarding", error);
    status = "connect-error";
  }

  redirectUrl.searchParams.set("stripe", status);
  redirectUrl.hash = "payments-stripe";
  return NextResponse.redirect(redirectUrl);
}
