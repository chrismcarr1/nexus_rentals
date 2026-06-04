import { NextResponse } from "next/server";

import { requireRoles } from "@/lib/auth";
import { UserRole } from "@/lib/store";
import { isStripeConnectReady, syncStripeConnectedAccount } from "@/lib/stripe-connect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const redirectUrl = new URL("/settings", request.url);
  let status = "connect-required";

  try {
    if (user.stripeConnectedAccountId) {
      const updatedUser = await syncStripeConnectedAccount(user);
      status = isStripeConnectReady(updatedUser) ? "connect-ready" : "connect-incomplete";
    }
  } catch (error) {
    console.error("[stripe] Failed to refresh Connect status after onboarding", error);
    status = "connect-error";
  }

  redirectUrl.searchParams.set("stripe", status);
  redirectUrl.hash = "payments-stripe";
  return NextResponse.redirect(redirectUrl);
}
