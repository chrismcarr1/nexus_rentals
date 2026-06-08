import type {
  RiskScoringInput,
  RiskScoringRules,
  RiskScoringResult,
  ScreeningRecommendation
} from "@/lib/screening/types";

const DEFAULT_RULES: RiskScoringRules = {
  approvedMaxRisk: 25,
  highRiskMin: 61,
  strongIncomeRatio: 3,
  reviewIncomeRatio: 2.5,
  minimumIncomeRatio: 2
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreTenantScreening(
  input: RiskScoringInput,
  rules: Partial<RiskScoringRules> = {}
): RiskScoringResult {
  const configured = { ...DEFAULT_RULES, ...rules };
  let score = 20;
  const reasons: string[] = [];
  const riskFlags: RiskScoringResult["riskFlags"] = [];
  const inputsUsed: string[] = ["monthly rent"];
  const income = input.plaid?.verifiedMonthlyIncome ?? input.statedMonthlyIncome ?? null;

  if (income && input.monthlyRent > 0) {
    const ratio = income / input.monthlyRent;
    inputsUsed.push(input.plaid?.verifiedMonthlyIncome ? "Plaid verified income" : "applicant stated income");
    if (ratio >= configured.strongIncomeRatio) {
      score -= 12;
      reasons.push(`Monthly income is ${ratio.toFixed(1)}x the target rent.`);
    } else if (ratio >= configured.reviewIncomeRatio) {
      score += 5;
      reasons.push(`Monthly income is ${ratio.toFixed(1)}x the target rent.`);
    } else if (ratio >= configured.minimumIncomeRatio) {
      score += 20;
      riskFlags.push({ code: "INCOME_RATIO_REVIEW", severity: "warning", message: "Income is below 2.5x monthly rent." });
    } else {
      score += 38;
      riskFlags.push({ code: "INCOME_RATIO_LOW", severity: "critical", message: "Income is below 2x monthly rent." });
    }
  } else {
    score += 15;
    reasons.push("Verified income is not available.");
    riskFlags.push({ code: "INCOME_UNVERIFIED", severity: "warning", message: "Income still needs verification." });
  }

  if (input.plaid) {
    inputsUsed.push("Plaid identity and account summary");
    if (input.plaid.identityVerified) {
      score -= 8;
      reasons.push("Plaid account ownership information matched the applicant.");
    } else {
      score += 18;
      riskFlags.push({ code: "IDENTITY_NOT_VERIFIED", severity: "warning", message: "Bank ownership information did not produce a confident match." });
    }
    if (input.plaid.warnings.length) {
      score += Math.min(12, input.plaid.warnings.length * 4);
      input.plaid.warnings.forEach((warning) => {
        riskFlags.push({ code: "PLAID_WARNING", severity: "warning", message: warning });
      });
    }
  }

  if (input.checkr) {
    inputsUsed.push("Checkr report disposition");
    if (input.checkr.status !== "COMPLETED") {
      score += 10;
      reasons.push("Background screening is not complete.");
    } else if (input.checkr.result === "clear") {
      score -= 12;
      reasons.push("Checkr returned a clear report disposition.");
    } else if (input.checkr.result === "consider") {
      score += 35;
      riskFlags.push({ code: "BACKGROUND_CONSIDER", severity: "critical", message: "Checkr returned a consider disposition requiring individualized review." });
    } else if (input.checkr.result === "suspended") {
      score += 20;
      riskFlags.push({ code: "BACKGROUND_SUSPENDED", severity: "warning", message: "The background report is suspended pending candidate information." });
    }
  } else {
    score += 10;
    reasons.push("Background screening has not been completed.");
  }

  const riskScore = clamp(score);
  let recommendation: ScreeningRecommendation = "needs_review";
  if (riskScore <= configured.approvedMaxRisk && input.checkr?.status === "COMPLETED" && input.plaid?.status === "COMPLETED") {
    recommendation = "approved";
  } else if (riskScore >= configured.highRiskMin) {
    recommendation = "high_risk";
  }

  if (!reasons.length) reasons.push("The available screening inputs require manual review.");

  return {
    riskScore,
    recommendation,
    reasons,
    riskFlags,
    inputsUsed,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Decision support only. Nexus does not approve or reject applicants. The landlord must review lawful criteria, provider reports, and applicable fair-housing and consumer-reporting requirements."
  };
}
