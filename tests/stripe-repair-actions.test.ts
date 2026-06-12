import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mocks = vi.hoisted(() => {
  class RedirectError extends Error {
    url: string;
    constructor(url: string) {
      super(`redirect:${url}`);
      this.url = url;
    }
  }
  return {
    RedirectError,
    redirect: vi.fn((url: string): never => {
      throw new RedirectError(url);
    }),
    retrieveAccount: vi.fn(),
    updateAccount: vi.fn(),
    createAccount: vi.fn(),
    createAccountLink: vi.fn(),
    createLoginLink: vi.fn(),
    updateUser: vi.fn(),
    recordPlatformEvent: vi.fn(),
    requireRoles: vi.fn(),
    requireSystemAdmin: vi.fn(),
    getUserById: vi.fn(),
    readStore: vi.fn(),
    hasAcceptedCurrentPaymentTerms: vi.fn(() => true)
  };
});

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    accounts: {
      retrieve: mocks.retrieveAccount,
      update: mocks.updateAccount,
      create: mocks.createAccount,
      createLoginLink: mocks.createLoginLink
    },
    accountLinks: { create: mocks.createAccountLink }
  })
}));

vi.mock("@/lib/db", () => ({
  db: { user: { update: mocks.updateUser } }
}));

vi.mock("@/lib/auth", () => ({
  requireRoles: mocks.requireRoles,
  requireSystemAdmin: mocks.requireSystemAdmin
}));

vi.mock("@/lib/legal", () => ({
  hasAcceptedCurrentPaymentTerms: mocks.hasAcceptedCurrentPaymentTerms
}));

vi.mock("@/lib/platform-events", () => ({
  recordPlatformEvent: mocks.recordPlatformEvent
}));

vi.mock("@/lib/request-origin", () => ({
  getAppBaseUrl: () => "https://app.example.test"
}));

vi.mock("@/lib/store", () => ({
  UserRole: { ADMIN: "ADMIN", MANAGER: "MANAGER", TENANT: "TENANT" },
  getUserById: mocks.getUserById,
  readStore: mocks.readStore
}));

vi.mock("@/lib/email", () => ({ sendAdminTestEmail: vi.fn() }));

const manager = {
  id: "user_c4914166c0b440d4",
  organizationId: "org_57730b0ac3274ebb",
  email: "manager@example.test",
  firstName: "Pat",
  lastName: "Manager",
  role: "MANAGER",
  stripeAccountId: "acct_1",
  stripeConnectedAccountId: "acct_1"
};

const admin = {
  id: "user_admin",
  organizationId: manager.organizationId,
  email: "admin@example.test",
  role: "ADMIN"
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
    controller: { stripe_dashboard: { type: "express" } },
    requirements: { currently_due: [], eventually_due: [], past_due: [], disabled_reason: null },
    ...overrides
  };
}

async function expectRedirect(promise: Promise<unknown>, includes: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(mocks.RedirectError);
    expect((error as InstanceType<typeof mocks.RedirectError>).url).toContain(includes);
    return;
  }
  throw new Error(`Expected a redirect containing "${includes}" but the action returned.`);
}

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasAcceptedCurrentPaymentTerms.mockReturnValue(true);
  mocks.requireRoles.mockResolvedValue({ ...manager });
  mocks.requireSystemAdmin.mockResolvedValue({ ...admin });
  mocks.getUserById.mockResolvedValue({ ...manager });
  mocks.readStore.mockResolvedValue({ users: [{ ...manager }] });
  mocks.updateUser.mockImplementation(async ({ where, data }: any) => ({ ...manager, id: where.id, ...data }));
  mocks.recordPlatformEvent.mockResolvedValue({});
  mocks.createAccountLink.mockResolvedValue({ url: "https://connect.stripe.test/onboarding" });
});

describe("attachStripeAccountAction", () => {
  it("attaches a valid account and records the repair", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(attachStripeAccountAction(formData({ accountId: "acct_1" })), "stripe=attach-success");

    expect(mocks.updateUser).toHaveBeenCalled();
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_REPAIRED", userId: manager.id, organizationId: manager.organizationId })
    );
  });

  it("rejects an account whose metadata belongs to a different user", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "acct_1" })),
      "stripe=attach-blocked&reason=metadata-user-mismatch"
    );

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_MISMATCH_DETECTED" })
    );
  });

  it("rejects an account from another organization", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: manager.id, organizationId: "org_other" } })
    );
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "acct_1" })),
      "reason=metadata-organization-mismatch"
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an account with missing metadata", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount({ metadata: {} }));
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(attachStripeAccountAction(formData({ accountId: "acct_1" })), "reason=metadata-missing");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses malformed account IDs without calling Stripe", async () => {
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(attachStripeAccountAction(formData({ accountId: "evil-input" })), "stripe=attach-invalid-id");
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
  });
});

describe("resyncStripeAccountAction", () => {
  it("re-syncs a valid stored account", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { resyncStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(resyncStripeAccountAction(), "stripe=resync-ok");

    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_RESYNCED" })
    );
  });

  it("refuses a stored account whose metadata belongs to another user", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { resyncStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(resyncStripeAccountAction(), "stripe=resync-blocked&reason=metadata-user-mismatch");

    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_MISMATCH_DETECTED" })
    );
  });
});

describe("reconnectStripeAccountAction", () => {
  it("requires the explicit confirmation checkbox", async () => {
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(reconnectStripeAccountAction(formData({})), "stripe=reconnect-confirm-required");

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("clears the stored account and creates a fresh one with correct metadata", async () => {
    mocks.createAccount.mockResolvedValue(stripeAccount({ id: "acct_new" }));
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      reconnectStripeAccountAction(formData({ confirmReconnect: "on" })),
      "https://connect.stripe.test/onboarding"
    );

    // First user update clears the old connection without deleting anything in Stripe.
    const clearCall = mocks.updateUser.mock.calls[0][0];
    expect(clearCall.data.stripeAccountId).toBeUndefined();
    expect(clearCall.data.stripeConnectedAccountId).toBeUndefined();

    expect(mocks.createAccount.mock.calls[0][0].metadata).toEqual({
      source: "nexus_manager_payouts",
      userId: manager.id,
      organizationId: manager.organizationId
    });
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_RECONNECT_STARTED" })
    );
  });
});

describe("adminRepairStripeAccountAction", () => {
  it("always refuses cross-organization accounts", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: manager.id, organizationId: "org_other" } })
    );
    const { adminRepairStripeAccountAction } = await import("@/lib/admin-actions");

    await expectRedirect(
      adminRepairStripeAccountAction(formData({ managerId: manager.id, accountId: "acct_1", confirmRepair: "on" })),
      "repair=blocked&reason=metadata-organization-mismatch"
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("shows a verification preview when the confirmation is not checked", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { adminRepairStripeAccountAction } = await import("@/lib/admin-actions");

    await expectRedirect(
      adminRepairStripeAccountAction(formData({ managerId: manager.id, accountId: "acct_1" })),
      "repair=confirm"
    );

    const redirectUrl = mocks.redirect.mock.calls.at(-1)?.[0] as string;
    expect(redirectUrl).toContain(`storedUser=${manager.id}`);
    expect(redirectUrl).toContain("metadataUser=user_other");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("repairs a same-organization user mismatch with explicit confirmation", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    mocks.updateAccount.mockResolvedValue(stripeAccount());
    const otherOwner = { ...manager, id: "user_other", stripeAccountId: "acct_1", stripeConnectedAccountId: "acct_1" };
    mocks.readStore.mockResolvedValue({ users: [{ ...manager }, otherOwner] });
    const { adminRepairStripeAccountAction } = await import("@/lib/admin-actions");

    await expectRedirect(
      adminRepairStripeAccountAction(formData({ managerId: manager.id, accountId: "acct_1", confirmRepair: "on" })),
      "repair=success"
    );

    // Metadata userId is re-stamped to the repaired manager.
    expect(mocks.updateAccount).toHaveBeenCalledWith("acct_1", {
      metadata: {
        source: "nexus_manager_payouts",
        userId: manager.id,
        organizationId: manager.organizationId
      }
    });
    // The previous local owner is detached so payouts cannot double-route.
    const detachCall = mocks.updateUser.mock.calls.find((call) => call[0].where.id === "user_other");
    expect(detachCall).toBeTruthy();
    expect(detachCall![0].data.stripeAccountId).toBeUndefined();

    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "STRIPE_ADMIN_OVERRIDE_USED",
        userId: admin.id,
        organizationId: manager.organizationId,
        metadata: expect.objectContaining({ previousMetadataUserId: "user_other" })
      })
    );
  });

  it("refuses repairs for tenants or unknown managers", async () => {
    mocks.getUserById.mockResolvedValue({ ...manager, role: "TENANT" });
    const { adminRepairStripeAccountAction } = await import("@/lib/admin-actions");

    await expectRedirect(
      adminRepairStripeAccountAction(formData({ managerId: manager.id, accountId: "acct_1", confirmRepair: "on" })),
      "repair=manager-missing"
    );
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
  });
});
