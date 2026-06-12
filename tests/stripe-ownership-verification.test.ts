import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  retrieveAccount: vi.fn(),
  updateAccount: vi.fn(),
  createAccount: vi.fn(),
  createLoginLink: vi.fn(),
  createAccountLink: vi.fn(),
  updateUser: vi.fn()
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    accounts: {
      retrieve: mocks.retrieveAccount,
      update: mocks.updateAccount,
      create: mocks.createAccount,
      createLoginLink: mocks.createLoginLink
    },
    accountLinks: {
      create: mocks.createAccountLink
    }
  })
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      update: mocks.updateUser
    }
  }
}));

const manager = {
  id: "user_c4914166c0b440d4",
  organizationId: "org_57730b0ac3274ebb",
  email: "manager@example.test",
  firstName: "Pat",
  lastName: "Manager",
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
      source: "nexus_manager_payouts",
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateUser.mockImplementation(async ({ where, data }: any) => ({ ...manager, ...where, ...data }));
});

describe("verifyStripeConnectedAccountOwnership", () => {
  async function verify(overrides: Record<string, unknown> = {}, allowUserMismatch = false) {
    const { verifyStripeConnectedAccountOwnership } = await import("@/lib/stripe-connect");
    mocks.retrieveAccount.mockResolvedValue(stripeAccount(overrides));
    return verifyStripeConnectedAccountOwnership({
      accountId: "acct_1",
      expectedUserId: manager.id,
      expectedOrganizationId: manager.organizationId,
      allowUserMismatch
    });
  }

  it("accepts an account whose metadata matches the user and organization", async () => {
    const result = await verify();
    expect(result).toMatchObject({
      valid: true,
      reason: "verified",
      accountId: "acct_1",
      stripeUserIdMetadata: manager.id,
      stripeOrganizationIdMetadata: manager.organizationId,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      dashboardType: "express"
    });
  });

  it("rejects a metadata userId mismatch for a normal manager", async () => {
    const result = await verify({ metadata: { userId: "user_other", organizationId: manager.organizationId } });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-user-mismatch");
    expect(result.stripeUserIdMetadata).toBe("user_other");
  });

  it("rejects a metadata organizationId mismatch even with allowUserMismatch", async () => {
    const result = await verify(
      { metadata: { userId: manager.id, organizationId: "org_other" } },
      true
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-organization-mismatch");
  });

  it("rejects missing metadata", async () => {
    const result = await verify({ metadata: {} });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-missing");
  });

  it("allows a same-organization userId mismatch only when the admin override flag is set", async () => {
    const result = await verify(
      { metadata: { userId: "user_other", organizationId: manager.organizationId } },
      true
    );
    expect(result.valid).toBe(true);
    expect(result.stripeUserIdMetadata).toBe("user_other");
  });

  it("reports a deleted account", async () => {
    mocks.retrieveAccount.mockResolvedValue({ id: "acct_1", deleted: true });
    const { verifyStripeConnectedAccountOwnership } = await import("@/lib/stripe-connect");
    const result = await verifyStripeConnectedAccountOwnership({
      accountId: "acct_1",
      expectedUserId: manager.id,
      expectedOrganizationId: manager.organizationId
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("account-deleted");
  });

  it("reports a missing account", async () => {
    mocks.retrieveAccount.mockRejectedValue({ statusCode: 404, code: "resource_missing" });
    const { verifyStripeConnectedAccountOwnership } = await import("@/lib/stripe-connect");
    const result = await verifyStripeConnectedAccountOwnership({
      accountId: "acct_nope",
      expectedUserId: manager.id,
      expectedOrganizationId: manager.organizationId
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("account-not-found");
  });

  it("never returns raw Stripe account payload fields", async () => {
    const result = await verify({ external_accounts: { data: [{ last4: "6789" }] } });
    expect(Object.keys(result).sort()).toEqual(
      [
        "valid",
        "reason",
        "accountId",
        "stripeUserIdMetadata",
        "stripeOrganizationIdMetadata",
        "chargesEnabled",
        "payoutsEnabled",
        "detailsSubmitted",
        "dashboardType",
        "disabledReason"
      ].sort()
    );
  });
});

describe("attachVerifiedStripeAccount", () => {
  it("attaches a valid account and stores verified ownership metadata", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { attachVerifiedStripeAccount } = await import("@/lib/stripe-connect");

    const result = await attachVerifiedStripeAccount(manager, "acct_1");

    expect(result.valid).toBe(true);
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    const { where, data } = mocks.updateUser.mock.calls[0][0];
    expect(where).toEqual({ id: manager.id });
    expect(data).toMatchObject({
      stripeAccountId: "acct_1",
      stripeConnectedAccountId: "acct_1",
      stripeMetadataUserId: manager.id,
      stripeMetadataOrganizationId: manager.organizationId,
      stripeMetadataMismatchReason: undefined
    });
    expect(data.stripeMetadataVerifiedAt).toBeTruthy();
  });

  it("refuses a userId mismatch for a normal manager and does not attach", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { attachVerifiedStripeAccount } = await import("@/lib/stripe-connect");

    const result = await attachVerifiedStripeAccount(manager, "acct_1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-user-mismatch");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses an organization mismatch and does not attach", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: manager.id, organizationId: "org_other" } })
    );
    const { attachVerifiedStripeAccount } = await import("@/lib/stripe-connect");

    const result = await attachVerifiedStripeAccount(manager, "acct_1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-organization-mismatch");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses missing metadata and does not attach", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount({ metadata: {} }));
    const { attachVerifiedStripeAccount } = await import("@/lib/stripe-connect");

    const result = await attachVerifiedStripeAccount(manager, "acct_1");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("metadata-missing");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("re-stamps metadata userId during a same-organization admin override", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    mocks.updateAccount.mockResolvedValue(stripeAccount());
    const { attachVerifiedStripeAccount } = await import("@/lib/stripe-connect");

    const result = await attachVerifiedStripeAccount(manager, "acct_1", { allowUserMismatch: true });

    expect(result.valid).toBe(true);
    expect(mocks.updateAccount).toHaveBeenCalledWith("acct_1", {
      metadata: {
        source: "nexus_manager_payouts",
        userId: manager.id,
        organizationId: manager.organizationId
      }
    });
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });
});

describe("verifyManagerPayoutDestination (checkout payout safety)", () => {
  it("passes and refreshes status when metadata matches", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination(manager);

    expect(result.ok).toBe(true);
    expect(result.accountId).toBe("acct_1");
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });

  it("blocks checkout on a metadata userId mismatch and records the reason", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination(manager);

    expect(result).toMatchObject({ ok: false, blocked: true, reason: "metadata-user-mismatch" });
    const { data } = mocks.updateUser.mock.calls[0][0];
    expect(data).toMatchObject({ stripeMetadataMismatchReason: "metadata-user-mismatch" });
  });

  it("blocks checkout on an organization mismatch", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: manager.id, organizationId: "org_other" } })
    );
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination(manager);

    expect(result).toMatchObject({ ok: false, blocked: true, reason: "metadata-organization-mismatch" });
  });

  it("fails closed when metadata is missing", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount({ metadata: {} }));
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination(manager);

    expect(result).toMatchObject({ ok: false, blocked: true, reason: "metadata-missing" });
  });

  it("treats a missing stored account as setup-required, not a mismatch", async () => {
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination({
      ...manager,
      stripeAccountId: undefined,
      stripeConnectedAccountId: undefined
    });

    expect(result).toMatchObject({ ok: false, blocked: false, reason: "account-missing" });
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
  });

  it("fails closed (ok=false) when Stripe cannot be reached", async () => {
    mocks.retrieveAccount.mockRejectedValue({ statusCode: 500, type: "StripeAPIError" });
    const { verifyManagerPayoutDestination } = await import("@/lib/stripe-connect");

    const result = await verifyManagerPayoutDestination(manager);

    expect(result).toMatchObject({ ok: false, blocked: false, reason: "stripe-error" });
  });
});

describe("verifyAndSyncStoredStripeAccount (repair re-sync)", () => {
  it("backfills missing metadata from local state for the stored account", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount({ metadata: {} }));
    mocks.updateAccount.mockResolvedValue(stripeAccount());
    const { verifyAndSyncStoredStripeAccount } = await import("@/lib/stripe-connect");

    const result = await verifyAndSyncStoredStripeAccount(manager);

    expect(result?.verification.valid).toBe(true);
    expect(result?.metadataBackfilled).toBe(true);
    expect(mocks.updateAccount).toHaveBeenCalledWith("acct_1", {
      metadata: {
        source: "nexus_manager_payouts",
        userId: manager.id,
        organizationId: manager.organizationId
      }
    });
  });

  it("refuses to backfill when existing metadata conflicts", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other" } })
    );
    const { verifyAndSyncStoredStripeAccount } = await import("@/lib/stripe-connect");

    const result = await verifyAndSyncStoredStripeAccount(manager);

    expect(result?.verification.valid).toBe(false);
    expect(mocks.updateAccount).not.toHaveBeenCalled();
    const { data } = mocks.updateUser.mock.calls[0][0];
    expect(data.stripeMetadataMismatchReason).toBeTruthy();
    // The stored account ID must not be cleared by a refused re-sync.
    expect(data.stripeAccountId).toBeUndefined();
    expect(Object.keys(data)).not.toContain("stripeAccountId");
  });

  it("refuses a full ownership mismatch and persists the reason", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: "org_other" } })
    );
    const { verifyAndSyncStoredStripeAccount } = await import("@/lib/stripe-connect");

    const result = await verifyAndSyncStoredStripeAccount(manager);

    expect(result?.verification.valid).toBe(false);
    expect(result?.verification.reason).toBe("metadata-organization-mismatch");
  });
});

describe("createManagerConnectedAccount (reconnect)", () => {
  it("creates the account with userId, organizationId, and source metadata", async () => {
    mocks.createAccount.mockResolvedValue(stripeAccount({ id: "acct_new" }));
    const { createManagerConnectedAccount } = await import("@/lib/stripe-connect");

    await createManagerConnectedAccount(manager);

    expect(mocks.createAccount).toHaveBeenCalledTimes(1);
    expect(mocks.createAccount.mock.calls[0][0].metadata).toEqual({
      source: "nexus_manager_payouts",
      userId: manager.id,
      organizationId: manager.organizationId
    });
  });
});

describe("dashboard link failure", () => {
  it("does not record an ownership mismatch when the login link fails", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    mocks.createLoginLink.mockRejectedValue({ type: "StripeInvalidRequestError", statusCode: 400 });
    const { getManagerStripeAccessResult } = await import("@/lib/stripe-connect");

    const result = await getManagerStripeAccessResult(manager, "https://app.example.test");

    expect(result).toMatchObject({ ok: false, status: "stripe-dashboard-unavailable", clearConnection: false });
    // Status sync before the link attempt should have stored verified
    // ownership, never a mismatch.
    for (const call of mocks.updateUser.mock.calls) {
      expect(call[0].data.stripeMetadataMismatchReason).toBeUndefined();
    }
  });
});
