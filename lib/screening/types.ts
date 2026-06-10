export type ScreeningProvider = "CHECKR" | "PLAID";
export type ScreeningRequestStatus =
  | "PENDING"
  | "INVITED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type ScreeningRecommendation = "approved" | "needs_review" | "high_risk";

export type ScreeningApplicationRecord = {
  id: string;
  sourceApplicationId: string;
  submissionId: string;
  applicantUserId?: string | null;
  applicantEmail: string;
  applicantFirstName: string;
  applicantLastName: string;
  propertyId: string;
  unitId?: string | null;
  landlordUserId: string;
  organizationId: string;
  monthlyRent: number;
  statedMonthlyIncome?: number | null;
  status: string;
  consentStatus: string;
  accessExpiresAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ScreeningRequestRecord = {
  id: string;
  applicationId: string;
  applicantUserId?: string | null;
  propertyId: string;
  unitId?: string | null;
  landlordUserId: string;
  provider: ScreeningProvider;
  screeningKind: string;
  status: ScreeningRequestStatus;
  providerRequestId?: string | null;
  errorMessage?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export type NormalizedCheckrResult = {
  provider: "CHECKR";
  status: ScreeningRequestStatus;
  reportId?: string;
  result?: "clear" | "consider" | "suspended" | "unknown";
  adjudication?: string | null;
  assessment?: string | null;
  completedAt?: string | null;
  findings: Array<{ category: string; status: string; label: string }>;
};

export type NormalizedPlaidResult = {
  provider: "PLAID";
  status: ScreeningRequestStatus;
  identityMatchScore?: number | null;
  identityVerified: boolean;
  verifiedMonthlyIncome?: number | null;
  annualIncome?: number | null;
  incomeStreams: number;
  accountCount: number;
  warnings: string[];
};

export type RiskScoringInput = {
  monthlyRent: number;
  statedMonthlyIncome?: number | null;
  plaid?: NormalizedPlaidResult | null;
  checkr?: NormalizedCheckrResult | null;
};

export type RiskScoringRules = {
  approvedMaxRisk: number;
  highRiskMin: number;
  strongIncomeRatio: number;
  reviewIncomeRatio: number;
  minimumIncomeRatio: number;
};

export type RiskScoringResult = {
  riskScore: number;
  recommendation: ScreeningRecommendation;
  reasons: string[];
  riskFlags: Array<{
    code: string;
    severity: "info" | "warning" | "critical";
    message: string;
  }>;
  inputsUsed: string[];
  generatedAt: string;
  disclaimer: string;
};

export type ScreeningSummary = {
  application: ScreeningApplicationRecord;
  requests: ScreeningRequestRecord[];
  checkr: NormalizedCheckrResult | null;
  plaid: NormalizedPlaidResult | null;
  checkrInvitationUrl?: string | null;
  recommendation: RiskScoringResult;
  applicantPortalReady: boolean;
  mockMode: {
    checkr: boolean;
    plaid: boolean;
  };
};
