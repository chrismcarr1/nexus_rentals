import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { update: vi.fn() } } }));

// Regression tripwires for the repair-flow wiring outage: the settings forms,
// the server actions they post to, and the field every money-movement path
// reads must all agree. These are source-level checks so a rename in one place
// fails loudly instead of producing buttons that "do nothing".

const ROOT = path.join(__dirname, "..");

async function read(relative: string) {
  return fs.readFile(path.join(ROOT, relative), "utf8");
}

describe("Stripe repair flow wiring", () => {
  it("settings forms post to the repair actions with the exact field names the actions read", async () => {
    const page = await read("app/(app)/settings/page.tsx");
    const actions = await read("lib/stripe-repair-actions.ts");

    // Attach form → attachStripeAccountAction reads formData.get("accountId").
    expect(page).toContain("action={attachStripeAccountAction}");
    expect(page).toContain('name="accountId"');
    expect(actions).toContain('formData.get("accountId")');

    // Re-sync button → resyncStripeAccountAction.
    expect(page).toContain("action={resyncStripeAccountAction}");

    // Reconnect form → reconnectStripeAccountAction reads confirmReconnect and
    // the inline payment-terms acknowledgement.
    expect(page).toContain("action={reconnectStripeAccountAction}");
    expect(page).toContain('name="confirmReconnect"');
    expect(actions).toContain('formData.get("confirmReconnect")');
    expect(page).toContain('name="acceptPaymentTerms"');
    expect(actions).toContain('formData.get("acceptPaymentTerms")');
  });

  it("settings displays every status the repair actions can redirect with", async () => {
    const page = await read("app/(app)/settings/page.tsx");
    const statuses = [
      "repair-success",
      "repair-rejected-user-mismatch",
      "repair-rejected-org-mismatch",
      "repair-invalid-account",
      "resync-success",
      "reconnect-started",
      "reconnect-confirmation-required",
      "repair-error"
    ];
    for (const status of statuses) {
      expect(page, `settings page has no message for stripe=${status}`).toContain(`"${status}"`);
    }
  });

  it("settings re-reads the user uncached after a repair redirect so the new account ID is visible", async () => {
    const page = await read("app/(app)/settings/page.tsx");
    expect(page).toContain("getUserByIdFresh");
  });

  it("settings, checkout, and the repair writes all use the same connected-account field", async () => {
    const page = await read("app/(app)/settings/page.tsx");
    const checkout = await read("lib/actions.ts");
    const connect = await read("lib/stripe-connect.ts");
    const adminAnalytics = await read("lib/admin-analytics.ts");

    // Reads all go through the single accessor.
    expect(page).toContain("getStripeAccountId(");
    expect(checkout).toContain("getStripeAccountId(");
    expect(checkout).toContain("verifyManagerPayoutDestination(");
    expect(adminAnalytics).toContain("getStripeAccountId(");

    // The repair/attach/sync write path stores both field aliases the accessor
    // can read, so no consumer can observe a half-written connection.
    expect(connect).toContain("stripeAccountId: account.id");
    expect(connect).toContain("stripeConnectedAccountId: account.id");
  });

  it("getStripeAccountId prefers stripeConnectedAccountId and falls back to stripeAccountId", async () => {
    const { getStripeAccountId } = await import("@/lib/stripe-connect");
    expect(getStripeAccountId({ stripeConnectedAccountId: "acct_new", stripeAccountId: "acct_old" } as any)).toBe("acct_new");
    expect(getStripeAccountId({ stripeAccountId: "acct_old" } as any)).toBe("acct_old");
    expect(getStripeAccountId(null)).toBeUndefined();
  });
});
