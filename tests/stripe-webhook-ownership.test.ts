import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  updateStore: vi.fn(),
  recordPlatformEvent: vi.fn()
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
  getStripeWebhookSecret: () => "whsec_test",
  getPlatformFeeCents: () => 100
}));

vi.mock("@/lib/db", () => ({
  db: {
    payment: {
      findFirst: mocks.paymentFindFirst,
      update: mocks.paymentUpdate
    },
    user: {
      findUnique: mocks.userFindUnique
    }
  }
}));

vi.mock("@/lib/store", () => ({
  nowIso: () => "2026-06-11T00:00:00.000Z",
  updateStore: mocks.updateStore
}));

vi.mock("@/lib/platform-events", () => ({
  recordPlatformEvent: mocks.recordPlatformEvent
}));

const ORG_A = "org_57730b0ac3274ebb";
const ORG_B = "org_other";

function checkoutSession(metadata: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    payment_status: "paid",
    amount_total: 120100,
    payment_intent: "pi_test_1",
    metadata,
    ...overrides
  };
}

function checkoutEvent(session: Record<string, unknown>) {
  return {
    id: "evt_test_1",
    type: "checkout.session.completed",
    created: 1_765_000_000,
    livemode: false,
    data: { object: session }
  };
}

function localPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment_1",
    unitId: "unit_1",
    status: "PENDING",
    amount: 1200,
    balanceDue: 1200,
    lateFeeAmount: 0,
    tenantId: "tenant_1",
    unit: { id: "unit_1", property: { id: "property_1", organizationId: ORG_A } },
    ...overrides
  };
}

async function postWebhook() {
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const request = new Request("https://app.example.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}"
  });
  return POST(request);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paymentUpdate.mockResolvedValue({});
  mocks.userFindUnique.mockResolvedValue({ id: "user_manager", organizationId: ORG_A });
  mocks.recordPlatformEvent.mockResolvedValue({});
});

describe("Stripe webhook ownership safety", () => {
  it("marks a payment paid when session metadata matches the local organization", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentId: "payment_1", organizationId: ORG_A, managerUserId: "user_manager", unitId: "unit_1" }))
    );
    mocks.paymentFindFirst.mockResolvedValue(localPayment());

    const response = await postWebhook();

    expect(response.status).toBe(200);
    expect(mocks.paymentUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.paymentUpdate.mock.calls[0][0].data.status).toBe("PAID");
  });

  it("cannot mark another organization's payment as paid", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentId: "payment_1", organizationId: ORG_B, unitId: "unit_1" }))
    );
    // Local payment belongs to ORG_A while the session claims ORG_B.
    mocks.paymentFindFirst.mockResolvedValue(localPayment());

    const response = await postWebhook();

    expect(response.status).toBe(500);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
    expect(mocks.updateStore).not.toHaveBeenCalled();
    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "STRIPE_WEBHOOK_FAILED" })
    );
  });

  it("rejects a session whose manager does not belong to the session organization", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentId: "payment_1", organizationId: ORG_A, managerUserId: "user_manager" }))
    );
    mocks.userFindUnique.mockResolvedValue({ id: "user_manager", organizationId: ORG_B });
    mocks.paymentFindFirst.mockResolvedValue(localPayment());

    const response = await postWebhook();

    expect(response.status).toBe(500);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent for a repeated delivery of the same session", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentId: "payment_1", organizationId: ORG_A }))
    );
    mocks.paymentFindFirst.mockResolvedValue(
      localPayment({ status: "PAID", stripeCheckoutSessionId: "cs_test_1" })
    );

    const response = await postWebhook();

    expect(response.status).toBe(200);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it("never overwrites a payment already paid via a different session", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentId: "payment_1", organizationId: ORG_A }))
    );
    mocks.paymentFindFirst.mockResolvedValue(
      localPayment({ status: "PAID", stripeCheckoutSessionId: "cs_earlier" })
    );

    const response = await postWebhook();

    expect(response.status).toBe(200);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it("verifies every payment in a bundle before writing and blocks cross-org bundles", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentIds: "payment_1,payment_2", organizationId: ORG_A }))
    );
    mocks.paymentFindFirst
      .mockResolvedValueOnce(localPayment())
      .mockResolvedValueOnce(
        localPayment({ id: "payment_2", unit: { id: "unit_2", property: { id: "property_2", organizationId: ORG_B } } })
      );

    const response = await postWebhook();

    expect(response.status).toBe(500);
    expect(mocks.updateStore).not.toHaveBeenCalled();
  });

  it("updates only unpaid payments in a verified bundle", async () => {
    mocks.constructEvent.mockReturnValue(
      checkoutEvent(checkoutSession({ paymentIds: "payment_1,payment_2", organizationId: ORG_A }))
    );
    mocks.paymentFindFirst
      .mockResolvedValueOnce(localPayment({ status: "PAID", stripeCheckoutSessionId: "cs_test_1" }))
      .mockResolvedValueOnce(localPayment({ id: "payment_2" }));
    mocks.updateStore.mockImplementation(async (mutate: any) => {
      const store = {
        payments: [
          { id: "payment_1", status: "PAID", amount: 1200, balanceDue: 0 },
          { id: "payment_2", status: "PENDING", amount: 1200, balanceDue: 1200 }
        ]
      };
      const next = await mutate(store);
      expect(next.payments.find((p: any) => p.id === "payment_2").status).toBe("PAID");
      // payment_1 was already paid and must be left untouched.
      expect(next.payments.find((p: any) => p.id === "payment_1")).toEqual(store.payments[0]);
      return next;
    });

    const response = await postWebhook();

    expect(response.status).toBe(200);
    expect(mocks.updateStore).toHaveBeenCalledTimes(1);
  });
});
