import "server-only";

import type Stripe from "stripe";

import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type { User } from "@/lib/store";

type StripeManagerUser = Pick<User, "id" | "organizationId" | "email" | "firstName" | "lastName" | "stripeConnectedAccountId">;

export function isStripeConnectReady(user?: Pick<User, "stripeConnectedAccountId" | "stripeChargesEnabled" | "stripePayoutsEnabled" | "stripeOnboardingComplete"> | null) {
  return Boolean(user?.stripeConnectedAccountId && user.stripeChargesEnabled && user.stripePayoutsEnabled && user.stripeOnboardingComplete);
}

function getStripeAccountStatus(account: Stripe.Account) {
  return {
    stripeConnectedAccountId: account.id,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeOnboardingComplete: Boolean(account.charges_enabled && account.payouts_enabled && account.details_submitted),
    stripeUpdatedAt: new Date().toISOString()
  };
}

export async function saveStripeAccountStatus(userId: string, account: Stripe.Account) {
  return db.user.update({
    where: { id: userId },
    data: getStripeAccountStatus(account)
  });
}

export async function syncStripeConnectedAccount(user: Pick<User, "id" | "stripeConnectedAccountId">) {
  if (!user.stripeConnectedAccountId) return null;

  const account = await getStripe().accounts.retrieve(user.stripeConnectedAccountId);
  if ((account as unknown as { deleted?: boolean }).deleted === true) {
    await db.user.update({
      where: { id: user.id },
      data: {
        stripeConnectedAccountId: undefined,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: false,
        stripeOnboardingComplete: false,
        stripeUpdatedAt: new Date().toISOString()
      }
    });
    return null;
  }

  return saveStripeAccountStatus(user.id, account as Stripe.Account);
}

export async function createStripeExpressAccount(user: StripeManagerUser) {
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

  await saveStripeAccountStatus(user.id, account);
  return account;
}
