import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("screening provider mock modes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APP_URL = "http://localhost:3000";
    process.env.CHECKR_MOCK_MODE = "true";
    process.env.PLAID_MOCK_MODE = "true";
    process.env.PLAID_ENV = "sandbox";
  });

  it("creates a deterministic Checkr invitation and clear report", async () => {
    const { createCheckrCandidate, createCheckrInvitation, getCheckrReport, normalizeCheckrReport } =
      await import("@/lib/screening/checkr");
    const application = {
      id: "appsub_demo",
      applicantFirstName: "Taylor",
      applicantLastName: "Jordan",
      applicantEmail: "taylor@example.com"
    } as any;
    const candidate = await createCheckrCandidate(application);
    const invitation = await createCheckrInvitation(candidate.id, application);
    const report = await getCheckrReport(invitation.report_id!);

    expect(candidate.id).toBe("mock_candidate_appsub_demo");
    expect(normalizeCheckrReport(report).result).toBe("clear");
  });

  it("normalizes matching Plaid identity and income", async () => {
    const { getPlaidIdentity, getPlaidIncome, normalizePlaidVerification } =
      await import("@/lib/screening/plaid");
    const application = {
      id: "appsub_demo",
      applicantFirstName: "Taylor",
      applicantLastName: "Jordan",
      applicantEmail: "taylor@example.com"
    } as any;
    const identity = await getPlaidIdentity("mock", application);
    const income = await getPlaidIncome({ providerUserId: "mock_user" });
    const result = normalizePlaidVerification({ application, identity, income });

    expect(result.identityVerified).toBe(true);
    expect(result.verifiedMonthlyIncome).toBe(7_000);
  });
});
