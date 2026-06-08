import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";

import { getPlaidConfig } from "@/lib/screening/config";
import type {
  NormalizedPlaidResult,
  ScreeningApplicationRecord
} from "@/lib/screening/types";

type PlaidUser = {
  user_id?: string;
  user_token?: string;
  request_id?: string;
};

async function plaidRequest<T>(path: string, body: Record<string, unknown>) {
  const config = getPlaidConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...body
    }),
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error_message?: string;
    display_message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.display_message || payload.error_message || `Plaid request failed with status ${response.status}.`);
  }
  return payload;
}

export async function createPlaidUser(application: ScreeningApplicationRecord): Promise<PlaidUser> {
  const config = getPlaidConfig();
  if (config.mock) {
    return { user_id: `mock_user_${application.id}`, user_token: `mock_user_token_${application.id}` };
  }

  return plaidRequest<PlaidUser>("/user/create", {
    client_user_id: application.id,
    identity: {
      name: {
        given_name: application.applicantFirstName,
        family_name: application.applicantLastName
      },
      emails: [{ data: application.applicantEmail, primary: true }]
    }
  });
}

export async function createPlaidLinkToken(input: {
  application: ScreeningApplicationRecord;
  providerUserId?: string | null;
  providerUserToken?: string | null;
}) {
  const config = getPlaidConfig();
  if (config.mock) {
    return {
      link_token: `link-mock-${input.application.id}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      request_id: `mock_link_${input.application.id}`
    };
  }

  const userReference = input.providerUserId ? { user_id: input.providerUserId } : {};
  const legacyUser = input.providerUserToken
    ? { user: { client_user_id: input.application.id, user_token: input.providerUserToken } }
    : input.providerUserId
      ? {}
      : { user: { client_user_id: input.application.id } };

  return plaidRequest<{ link_token: string; expiration: string; request_id: string }>("/link/token/create", {
    ...userReference,
    ...legacyUser,
    client_name: "Nexus Rentals",
    country_codes: ["US"],
    language: "en",
    products: ["income_verification"],
    optional_products: ["identity"],
    webhook: config.webhookUrl,
    income_verification: {
      income_source_types: ["bank"]
    }
  });
}

export async function exchangePlaidPublicToken(publicToken: string) {
  const config = getPlaidConfig();
  if (config.mock) {
    return {
      access_token: `mock_access_${publicToken}`,
      item_id: `mock_item_${publicToken}`,
      request_id: `mock_exchange_${publicToken}`
    };
  }
  return plaidRequest<{ access_token: string; item_id: string; request_id: string }>(
    "/item/public_token/exchange",
    { public_token: publicToken }
  );
}

export async function getPlaidIdentity(accessToken?: string | null, application?: ScreeningApplicationRecord) {
  const config = getPlaidConfig();
  if (config.mock) {
    return {
      accounts: [
        {
          account_id: "mock_account",
          owners: [{
            names: [application ? `${application.applicantFirstName} ${application.applicantLastName}` : "Mock Applicant"],
            emails: [{ data: application?.applicantEmail ?? "mock@example.com" }],
            phone_numbers: []
          }]
        }
      ]
    };
  }
  if (!accessToken) return { accounts: [] };
  return plaidRequest<Record<string, any>>("/identity/get", { access_token: accessToken });
}

export async function getPlaidIncome(input: {
  providerUserId?: string | null;
  providerUserToken?: string | null;
}) {
  const config = getPlaidConfig();
  if (config.mock) {
    return {
      bank_income: [
        {
          bank_income_summary: {
            income_sources_count: 2,
            total_amount: 84_000
          }
        }
      ]
    };
  }
  const reference = input.providerUserId
    ? { user_id: input.providerUserId }
    : input.providerUserToken
      ? { user_token: input.providerUserToken }
      : {};
  return plaidRequest<Record<string, any>>("/credit/bank_income/get", reference);
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9@.]/g, "");
}

export function normalizePlaidVerification(input: {
  application: ScreeningApplicationRecord;
  identity: Record<string, any>;
  income: Record<string, any>;
}): NormalizedPlaidResult {
  const accounts = Array.isArray(input.identity.accounts) ? input.identity.accounts : [];
  const owners = accounts.flatMap((account: any) => (Array.isArray(account.owners) ? account.owners : []));
  const expectedName = normalized(`${input.application.applicantFirstName}${input.application.applicantLastName}`);
  const expectedEmail = normalized(input.application.applicantEmail);
  const names = owners.flatMap((owner: any) => owner.names ?? []).map(normalized);
  const emails = owners
    .flatMap((owner: any) => owner.emails ?? [])
    .map((entry: any) => normalized(entry?.data ?? entry));
  let identityMatchScore = 0;
  if (names.some((name: string) => name.includes(expectedName) || expectedName.includes(name))) identityMatchScore += 60;
  if (emails.includes(expectedEmail)) identityMatchScore += 40;

  const bankIncome = Array.isArray(input.income.bank_income) ? input.income.bank_income : [];
  const summaries = bankIncome.map((entry: any) => entry.bank_income_summary ?? {});
  const annualIncome = summaries.reduce((sum: number, summary: any) => {
    const history = Array.isArray(summary.historical_summary) ? summary.historical_summary : [];
    const historicalTotal = history.reduce((total: number, period: any) => {
      const amount = Number(period.total_amount ?? 0);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const amount = Number(summary.annual_income ?? summary.total_amount ?? historicalTotal);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const incomeStreams = summaries.reduce(
    (sum: number, summary: any) => sum + Number(summary.income_sources_count ?? 0),
    0
  );
  const warnings: string[] = [];
  if (!accounts.length) warnings.push("No account ownership data was returned.");
  if (!annualIncome) warnings.push("Plaid did not return a verified income amount.");

  return {
    provider: "PLAID",
    status: "COMPLETED",
    identityMatchScore,
    identityVerified: identityMatchScore >= 60,
    verifiedMonthlyIncome: annualIncome ? annualIncome / 12 : null,
    annualIncome: annualIncome || null,
    incomeStreams,
    accountCount: accounts.length,
    warnings
  };
}

export async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null, fallbackSignature: string | null) {
  const config = getPlaidConfig();
  if (verificationHeader) {
    const protectedHeader = decodeProtectedHeader(verificationHeader);
    if (protectedHeader.alg !== "ES256" || !protectedHeader.kid) return false;
    const response = await plaidRequest<{ key: JWK }>("/webhook_verification_key/get", {
      key_id: protectedHeader.kid
    });
    const key = await importJWK(response.key, "ES256");
    const { payload } = await jwtVerify(verificationHeader, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 minutes"
    });
    const bodyHash = createHash("sha256").update(rawBody).digest("hex");
    return payload.request_body_sha256 === bodyHash;
  }

  if (config.webhookSecret && fallbackSignature) {
    const expected = createHmac("sha256", config.webhookSecret).update(rawBody).digest("hex");
    const actual = fallbackSignature.replace(/^sha256=/i, "");
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  return config.mock && process.env.NODE_ENV !== "production";
}
