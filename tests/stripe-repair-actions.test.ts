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
  const stripeFns = {
    retrieveAccount: vi.fn(),
    updateAccount: vi.fn(),
    createAccount: vi.fn(),
    createAccountLink: vi.fn(),
    createLoginLink: vi.fn()
  };
  return {
    RedirectError,
    ...stripeFns,
    redirect: vi.fn((url: string): never => {
      throw new RedirectError(url);
    }),
    getStripe: vi.fn(() => ({
      accounts: {
        retrieve: stripeFns.retrieveAccount,
        update: stripeFns.updateAccount,
        create: stripeFns.createAccount,
        createLoginLink: stripeFns.createLoginLink
      },
      accountLinks: { create: stripeFns.createAccountLink }
    })),
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
  getStripe: mocks.getStripe
}));

vi.mock("@/lib/db", () => ({
  db: { user: { update: mocks.updateUser } }
}));

vi.mock("@/lib/auth", () => ({
  requireRoles: mocks.requireRoles,
  requireSystemAdmin: mocks.requireSystemAdmin
}));

vi.mock("@/lib/legal", () => ({
  hasAcceptedCurrentPaymentTerms: mocks.hasAcceptedCurrentPaymentTerms,
  PAYMENT_TERMS_VERSION: "test-payment-terms-v1"
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
    return (error as InstanceType<typeof mocks.RedirectError>).url;
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
  it("attaches a valid account, mutates the current user record, and reports repair-success", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    const url = await expectRedirect(attachStripeAccountAction(formData({ accountId: "acct_1" })), "stripe=repair-success");
    expect(url).toContain("account=acct_1");

    // The mutation targets the logged-in user and writes both connected
    // account fields — the same fields settings displays and checkout reads.
    const { where, data } = mocks.updateUser.mock.calls[0][0];
    expect(where).toEqual({ id: manager.id });
    expect(data.stripeAccountId).toBe("acct_1");
    expect(data.stripeConnectedAccountId).toBe("acct_1");
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_REPAIRED", userId: manager.id, organizationId: manager.organizationId })
    );
  });

  it("rejects a userId mismatch with a clear status and does not mutate", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "acct_1" })),
      "stripe=repair-rejected-user-mismatch"
    );

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_MISMATCH_DETECTED" })
    );
  });

  it("rejects an organization mismatch with a clear status and does not mutate", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: manager.id, organizationId: "org_other" } })
    );
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "acct_1" })),
      "stripe=repair-rejected-org-mismatch"
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an account with missing metadata as repair-invalid-account", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount({ metadata: {} }));
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    const url = await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "acct_1" })),
      "stripe=repair-invalid-account"
    );
    expect(url).toContain("reason=metadata-missing");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses malformed account IDs without calling Stripe", async () => {
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    const url = await expectRedirect(
      attachStripeAccountAction(formData({ accountId: "evil-input" })),
      "stripe=repair-invalid-account"
    );
    expect(url).toContain("reason=invalid-id");
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
  });

  it("reports a Stripe environment refusal as repair-error/stripe-config, never as an ownership problem", async () => {
    // lib/stripe-env throws before any network call when a live key is used
    // outside production (the exact situation in local development).
    mocks.getStripe.mockImplementationOnce(() => {
      throw new Error("Refusing to initialize Stripe with a LIVE secret key in the development environment");
    });
    const { attachStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    const url = await expectRedirect(attachStripeAccountAction(formData({ accountId: "acct_1" })), "stripe=repair-error");
    expect(url).toContain("reason=stripe-config");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    // Not an ownership fact: no mismatch event is recorded.
    expect(mocks.recordPlatformEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_MISMATCH_DETECTED" })
    );
  });
});

describe("resyncStripeAccountAction", () => {
  it("re-syncs a valid stored account and stores a fresh metadataVerifiedAt", async () => {
    mocks.retrieveAccount.mockResolvedValue(stripeAccount());
    const { resyncStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(resyncStripeAccountAction(), "stripe=resync-success");

    const { data } = mocks.updateUser.mock.calls[0][0];
    expect(data.stripeMetadataVerifiedAt).toBeTruthy();
    expect(data.stripeMetadataMismatchReason).toBeUndefined();
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_RESYNCED" })
    );
  });

  it("refuses a stored account whose metadata belongs to another user", async () => {
    mocks.retrieveAccount.mockResolvedValue(
      stripeAccount({ metadata: { userId: "user_other", organizationId: manager.organizationId } })
    );
    const { resyncStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(resyncStripeAccountAction(), "stripe=repair-rejected-user-mismatch");

    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_ACCOUNT_MISMATCH_DETECTED" })
    );
  });
});

describe("reconnectStripeAccountAction", () => {
  it("requires the explicit confirmation checkbox", async () => {
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(reconnectStripeAccountAction(formData({})), "stripe=reconnect-confirmation-required");

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("creates the replacement account first and redirects to Stripe onboarding", async () => {
    mocks.createAccount.mockResolvedValue(stripeAccount({ id: "acct_new" }));
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      reconnectStripeAccountAction(formData({ confirmReconnect: "on" })),
      "https://connect.stripe.test/onboarding"
    );

    // No destructive pre-clear: the very first user write already stores the
    // new account (overwriting the old fields in the same update).
    const firstWrite = mocks.updateUser.mock.calls[0][0];
    expect(firstWrite.where).toEqual({ id: manager.id });
    expect(firstWrite.data.stripeAccountId).toBe("acct_new");
    expect(firstWrite.data.stripeConnectedAccountId).toBe("acct_new");

    expect(mocks.createAccount.mock.calls[0][0].metadata).toEqual({
      source: "nexus_manager_payouts",
      userId: manager.id,
      organizationId: manager.organizationId
    });
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "STRIPE_ACCOUNT_RECONNECT_STARTED",
        metadata: expect.objectContaining({ previousAccountId: "acct_1", newAccountId: "acct_new" })
      })
    );
  });

  it("leaves the previous connection untouched when account creation fails", async () => {
    mocks.createAccount.mockRejectedValue(new Error("Stripe unavailable"));
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    const url = await expectRedirect(
      reconnectStripeAccountAction(formData({ confirmReconnect: "on" })),
      "stripe=repair-error"
    );
    expect(url).toContain("reason=reconnect-failed");
    // The stored account was never cleared or replaced.
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("bounces to payment-terms-required when terms are outstanding and the checkbox is absent", async () => {
    mocks.hasAcceptedCurrentPaymentTerms.mockReturnValue(false);
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      reconnectStripeAccountAction(formData({ confirmReconnect: "on" })),
      "stripe=payment-terms-required"
    );
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("records inline payment-terms acceptance and proceeds", async () => {
    mocks.hasAcceptedCurrentPaymentTerms.mockReturnValue(false);
    mocks.createAccount.mockResolvedValue(stripeAccount({ id: "acct_new" }));
    const { reconnectStripeAccountAction } = await import("@/lib/stripe-repair-actions");

    await expectRedirect(
      reconnectStripeAccountAction(formData({ confirmReconnect: "on", acceptPaymentTerms: "on" })),
      "https://connect.stripe.test/onboarding"
    );

    const termsWrite = mocks.updateUser.mock.calls.find(
      (call) => call[0].data.paymentTermsVersionAccepted === "test-payment-terms-v1"
    );
    expect(termsWrite).toBeTruthy();
    expect(mocks.createAccount).toHaveBeenCalled();
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

    expect(mocks.updateAccount).toHaveBeenCalledWith("acct_1", {
      metadata: {
        source: "nexus_manager_payouts",
        userId: manager.id,
        organizationId: manager.organizationId
      }
    });
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
