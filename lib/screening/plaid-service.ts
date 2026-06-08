import "server-only";

import {
  createPlaidLinkToken,
  createPlaidUser,
  exchangePlaidPublicToken,
  getPlaidIdentity,
  getPlaidIncome,
  normalizePlaidVerification
} from "@/lib/screening/plaid";
import { decryptProviderToken, encryptProviderToken } from "@/lib/screening/crypto";
import {
  getScreeningApplication,
  getLatestRequest,
  getPlaidVerification,
  markApplicantConsent,
  savePlaidVerification,
  saveScreeningResult,
  updateScreeningRequest
} from "@/lib/screening/repository";
import type { ScreeningApplicationRecord } from "@/lib/screening/types";

export async function createApplicantPlaidLink(
  application: ScreeningApplicationRecord,
  consentAccepted: boolean
) {
  if (!consentAccepted) throw new Error("Consent is required before connecting a financial account.");
  const request = await getLatestRequest(application.id, "PLAID");
  if (!request || ["FAILED", "EXPIRED"].includes(request.status)) {
    throw new Error("The property manager has not requested Plaid verification.");
  }

  await markApplicantConsent(application.id);
  let verification = await getPlaidVerification(request.id);
  let providerUserId = verification?.provider_user_id ?? null;
  let providerUserToken = decryptProviderToken(verification?.provider_user_token_encrypted);

  if (!providerUserId && !providerUserToken) {
    const user = await createPlaidUser(application);
    providerUserId = user.user_id ?? null;
    providerUserToken = user.user_token ?? null;
    await savePlaidVerification({
      applicationId: application.id,
      requestId: request.id,
      providerUserId,
      providerUserTokenEncrypted: providerUserToken ? encryptProviderToken(providerUserToken) : null,
      status: "IN_PROGRESS",
      consented: true
    });
    verification = await getPlaidVerification(request.id);
  }

  const link = await createPlaidLinkToken({ application, providerUserId, providerUserToken });
  await updateScreeningRequest(request.id, {
    status: "IN_PROGRESS",
    providerRequestId: link.request_id,
    metadata: { linkExpiration: link.expiration }
  });
  return { linkToken: link.link_token, mock: link.link_token.startsWith("link-mock-") };
}

export async function completeApplicantPlaidLink(
  application: ScreeningApplicationRecord,
  publicToken: string
) {
  const request = await getLatestRequest(application.id, "PLAID");
  if (!request) throw new Error("Plaid verification has not been requested.");
  const verification = await getPlaidVerification(request.id);
  if (!verification) throw new Error("Plaid verification record is missing.");

  try {
    const exchange = await exchangePlaidPublicToken(publicToken);
    const accessToken = exchange.access_token;
    const providerUserToken = decryptProviderToken(verification.provider_user_token_encrypted);
    const [identity, income] = await Promise.all([
      getPlaidIdentity(accessToken, application),
      getPlaidIncome({
        providerUserId: verification.provider_user_id,
        providerUserToken
      })
    ]);
    const normalized = normalizePlaidVerification({ application, identity, income });

    await savePlaidVerification({
      applicationId: application.id,
      requestId: request.id,
      providerUserId: verification.provider_user_id,
      providerUserTokenEncrypted: verification.provider_user_token_encrypted,
      itemId: exchange.item_id,
      accessTokenEncrypted: encryptProviderToken(accessToken),
      status: "COMPLETED",
      consented: true,
      identityStatus: normalized.identityVerified ? "VERIFIED" : "REVIEW",
      incomeStatus: normalized.verifiedMonthlyIncome ? "VERIFIED" : "REVIEW",
      metadata: { requestId: exchange.request_id }
    });
    await saveScreeningResult({
      applicationId: application.id,
      requestId: request.id,
      provider: "PLAID",
      status: "COMPLETED",
      providerResultId: exchange.item_id,
      rawResponse: { identity, income },
      normalizedResult: normalized
    });
    await updateScreeningRequest(request.id, {
      status: "COMPLETED",
      providerRequestId: exchange.item_id
    });
    return normalized;
  } catch (error) {
    await updateScreeningRequest(request.id, {
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "Plaid verification failed."
    });
    throw error;
  }
}

export async function refreshPlaidVerification(requestId: string, applicationId: string) {
  const [verification, application] = await Promise.all([
    getPlaidVerification(requestId),
    getScreeningApplication(applicationId)
  ]);
  if (!verification || !application) throw new Error("Plaid verification record could not be resolved.");
  const accessToken = decryptProviderToken(verification.access_token_encrypted);
  const providerUserToken = decryptProviderToken(verification.provider_user_token_encrypted);
  const [identity, income] = await Promise.all([
    getPlaidIdentity(accessToken, application),
    getPlaidIncome({
      providerUserId: verification.provider_user_id,
      providerUserToken
    })
  ]);
  const normalized = normalizePlaidVerification({ application, identity, income });
  await savePlaidVerification({
    applicationId,
    requestId,
    providerUserId: verification.provider_user_id,
    providerUserTokenEncrypted: verification.provider_user_token_encrypted,
    itemId: verification.item_id,
    accessTokenEncrypted: verification.access_token_encrypted,
    status: "COMPLETED",
    identityStatus: normalized.identityVerified ? "VERIFIED" : "REVIEW",
    incomeStatus: normalized.verifiedMonthlyIncome ? "VERIFIED" : "REVIEW"
  });
  await saveScreeningResult({
    applicationId,
    requestId,
    provider: "PLAID",
    status: "COMPLETED",
    providerResultId: verification.item_id,
    rawResponse: { identity, income },
    normalizedResult: normalized
  });
  await updateScreeningRequest(requestId, {
    status: "COMPLETED",
    providerRequestId: verification.item_id
  });
  return normalized;
}
