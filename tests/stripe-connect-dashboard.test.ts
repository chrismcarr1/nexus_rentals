import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  retrieveAccount: vi.fn(),
  createLoginLink: vi.fn(),
  createAccountLink: vi.fn(),
  updateUser: vi.fn()
}));

vi.mock("../lib/stripe", () => ({
  getStripe: () => ({
    accounts: {
      retrieve: mocks.retrieveAccount,
      createLoginLink: mocks.createLoginLink
    },
    accountLinks: {
      create: mocks.createAccountLink
    }
  })
}));

vi.mock("../lib/db", () => ({
  db: {
    user: {
      update: mocks.updateUser
    }
  }
}));

const manager = {
  id: "manager_1",
  organizationId: "org_1",
  stripeAccountId: "acct_1",
  stripeConnectedAccountId: "acct_1"
};

function stripeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct_1",
    object: "account",
    type: "express",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    metadata: {
      userId: manager.id,
      organizationId: manager.organizationId
    },
    controller: {
      type: "application",
      requirement_collection: "stripe",
      stripe_dashboard: { type: "express" }
    },
    requirements: {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      disabled_reason: null
    },
    ...overrides
  };
}

describe("manager Stripe dashboard access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUser.mockResolvedValue(manager);
    mocks.createLoginLink.mockResolvedValue({ url: "https://connect.stripe.test/express" });
    mocks.createAccountLink.mockResolvedValue({ url: "https://connect.stripe.test/onboarding" });
  });

  it("creates a login link for a completed Express account", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { createManagerStripeAccessLink } = await import("../lib/stripe-connect");

    const result = await createManagerStripeAccessLink(manager, "https://app.example.test");

    expect(result).toEqual({
      url: "https://connect.stripe.test/express",
      mode: "dashboard"
    });
    expect(mocks.retrieveAccount).toHaveBeenCalledWith("acct_1");
    expect(mocks.createLoginLink).toHaveBeenCalledWith("acct_1");
    expect(mocks.createAccountLink).not.toHaveBeenCalled();
  });

  it.each([
    ["details are not submitted", false, []],
    ["requirements are currently due", true, ["individual.verification.document"]]
  ])("creates an onboarding link when %s", async (_label, detailsSubmitted, currentlyDue) => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({
        details_submitted: detailsSubmitted,
        requirements: {
          currently_due: currentlyDue,
          eventually_due: currentlyDue,
          past_due: [],
          disabled_reason: null
        }
      })
    );
    const { createManagerStripeAccessLink } = await import("../lib/stripe-connect");

    const result = await createManagerStripeAccessLink(manager, "https://app.example.test");

    expect(result).toEqual({
      url: "https://connect.stripe.test/onboarding",
      mode: "onboarding"
    });
    expect(mocks.createAccountLink).toHaveBeenCalledWith({
      account: "acct_1",
      refresh_url: "https://app.example.test/settings?stripe=connect-refresh#payments-stripe",
      return_url: "https://app.example.test/api/stripe/connect/return",
      type: "account_onboarding"
    });
    expect(mocks.createLoginLink).not.toHaveBeenCalled();
  });

  it("turns a Stripe 400 into a friendly dashboard-unavailable result", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    mocks.createLoginLink.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "account_invalid",
      statusCode: 400
    });
    const { getManagerStripeAccessResult } = await import("../lib/stripe-connect");

    const result = await getManagerStripeAccessResult(manager, "https://app.example.test");

    expect(result).toMatchObject({
      ok: false,
      status: "stripe-dashboard-unavailable",
      clearConnection: false,
      diagnostic: {
        type: "StripeInvalidRequestError",
        code: "account_invalid",
        statusCode: 400
      }
    });
  });

  it("rejects a connected account owned by another organization", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({
        metadata: {
          userId: "manager_2",
          organizationId: "org_2"
        }
      })
    );
    const { getManagerStripeAccessResult } = await import("../lib/stripe-connect");

    const result = await getManagerStripeAccessResult(manager, "https://app.example.test");

    expect(result).toMatchObject({
      ok: false,
      status: "stripe-account-mismatch",
      clearConnection: true
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.createLoginLink).not.toHaveBeenCalled();
    expect(mocks.createAccountLink).not.toHaveBeenCalled();
  });
});
