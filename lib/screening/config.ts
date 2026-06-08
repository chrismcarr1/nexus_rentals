import "server-only";

import { getAppBaseUrl } from "@/lib/request-origin";

function boolEnv(name: string) {
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Configure it before using live tenant screening.`);
  return value;
}

export function getCheckrConfig() {
  const mock = boolEnv("CHECKR_MOCK_MODE");
  return {
    mock,
    apiKey: mock ? process.env.CHECKR_API_KEY?.trim() : required("CHECKR_API_KEY"),
    packageSlug: mock ? process.env.CHECKR_PACKAGE_SLUG?.trim() || "mock_tenant_screening" : required("CHECKR_PACKAGE_SLUG"),
    webhookSecret: process.env.CHECKR_WEBHOOK_SECRET?.trim(),
    baseUrl: process.env.CHECKR_API_BASE_URL?.trim() || "https://api.checkr.com/v1"
  };
}

export function getPlaidConfig() {
  const mock = boolEnv("PLAID_MOCK_MODE");
  const environment = (process.env.PLAID_ENV?.trim().toLowerCase() || "sandbox") as "sandbox" | "production";
  if (!["sandbox", "production"].includes(environment)) {
    throw new Error("PLAID_ENV must be sandbox or production.");
  }

  return {
    mock,
    clientId: mock ? process.env.PLAID_CLIENT_ID?.trim() : required("PLAID_CLIENT_ID"),
    secret: mock ? process.env.PLAID_SECRET?.trim() : required("PLAID_SECRET"),
    publicKey: process.env.PLAID_PUBLIC_KEY?.trim(),
    webhookSecret: process.env.PLAID_WEBHOOK_SECRET?.trim(),
    environment,
    baseUrl: environment === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com",
    webhookUrl: `${getAppBaseUrl()}/api/webhooks/plaid`
  };
}

export function getScreeningDiagnostics() {
  const checkrMock = boolEnv("CHECKR_MOCK_MODE");
  const plaidMock = boolEnv("PLAID_MOCK_MODE");
  return {
    checkr: {
      mock: checkrMock,
      apiKeyPresent: Boolean(process.env.CHECKR_API_KEY?.trim()),
      packagePresent: Boolean(process.env.CHECKR_PACKAGE_SLUG?.trim()),
      webhookSecretPresent: Boolean(process.env.CHECKR_WEBHOOK_SECRET?.trim())
    },
    plaid: {
      mock: plaidMock,
      clientIdPresent: Boolean(process.env.PLAID_CLIENT_ID?.trim()),
      secretPresent: Boolean(process.env.PLAID_SECRET?.trim()),
      publicKeyPresent: Boolean(process.env.PLAID_PUBLIC_KEY?.trim()),
      webhookSecretPresent: Boolean(process.env.PLAID_WEBHOOK_SECRET?.trim()),
      environment: process.env.PLAID_ENV?.trim() || "sandbox"
    },
    appUrlHost: new URL(getAppBaseUrl()).host,
    encryptionKeyPresent: Boolean(process.env.SCREENING_ENCRYPTION_KEY?.trim())
  };
}

export function getScreeningMockMode() {
  return {
    checkr: boolEnv("CHECKR_MOCK_MODE"),
    plaid: boolEnv("PLAID_MOCK_MODE")
  };
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getRiskScoringRules() {
  return {
    approvedMaxRisk: numberEnv("SCREENING_APPROVED_MAX_RISK", 25),
    highRiskMin: numberEnv("SCREENING_HIGH_RISK_MIN", 61),
    strongIncomeRatio: numberEnv("SCREENING_STRONG_INCOME_RATIO", 3),
    reviewIncomeRatio: numberEnv("SCREENING_REVIEW_INCOME_RATIO", 2.5),
    minimumIncomeRatio: numberEnv("SCREENING_MINIMUM_INCOME_RATIO", 2)
  };
}
