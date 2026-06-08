import { describe, expect, it } from "vitest";

import { scoreTenantScreening } from "@/lib/screening/riskScoring";

describe("tenant screening recommendation", () => {
  it("returns an approved recommendation only when both providers are complete and low risk", () => {
    const result = scoreTenantScreening({
      monthlyRent: 2_000,
      statedMonthlyIncome: 7_000,
      plaid: {
        provider: "PLAID",
        status: "COMPLETED",
        identityVerified: true,
        identityMatchScore: 92,
        verifiedMonthlyIncome: 7_000,
        annualIncome: 84_000,
        incomeStreams: 2,
        accountCount: 2,
        warnings: []
      },
      checkr: {
        provider: "CHECKR",
        status: "COMPLETED",
        result: "clear",
        findings: []
      }
    });

    expect(result.recommendation).toBe("approved");
    expect(result.riskScore).toBeLessThanOrEqual(25);
    expect(result.disclaimer).toContain("does not approve or reject");
  });

  it("flags a consider disposition for human review", () => {
    const result = scoreTenantScreening({
      monthlyRent: 2_000,
      statedMonthlyIncome: 4_000,
      checkr: {
        provider: "CHECKR",
        status: "COMPLETED",
        result: "consider",
        findings: []
      }
    });

    expect(result.recommendation).toBe("high_risk");
    expect(result.riskFlags.some((flag) => flag.code === "BACKGROUND_CONSIDER")).toBe(true);
  });
});
