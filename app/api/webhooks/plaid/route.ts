import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { verifyPlaidWebhook } from "@/lib/screening/plaid";
import { refreshPlaidVerification } from "@/lib/screening/plaid-service";
import {
  completeWebhookEvent,
  findPlaidRequest,
  recordWebhookEvent,
  redactProviderPayload,
  updateScreeningRequest
} from "@/lib/screening/repository";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let isValid = false;
  try {
    isValid = await verifyPlaidWebhook(
      rawBody,
      request.headers.get("plaid-verification"),
      request.headers.get("x-plaid-signature")
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plaid webhook verification is not configured." },
      { status: 503 }
    );
  }
  if (!isValid) {
    return NextResponse.json({ error: "Invalid Plaid webhook signature." }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  const eventType = `${payload.webhook_type ?? "UNKNOWN"}.${payload.webhook_code ?? "UNKNOWN"}`;
  const eventId = String(
    payload.webhook_id ||
    payload.request_id ||
    createHash("sha256").update(rawBody).digest("hex")
  );
  const event = await recordWebhookEvent({
    provider: "PLAID",
    providerEventId: eventId,
    eventType,
    rawBody,
    payload: redactProviderPayload(payload)
  });
  if (!event.isNew) return NextResponse.json({ received: true, duplicate: true });

  try {
    const screeningRequest = await findPlaidRequest({
      providerUserId: payload.user_id || payload.user_token,
      itemId: payload.item_id
    });
    if (screeningRequest) {
      const shouldRefresh =
        String(payload.webhook_code ?? "").includes("READY") ||
        String(payload.webhook_code ?? "").includes("COMPLETE") ||
        String(payload.webhook_code ?? "").includes("UPDATE");
      if (shouldRefresh) {
        await refreshPlaidVerification(screeningRequest.id, screeningRequest.applicationId);
      } else {
        await updateScreeningRequest(screeningRequest.id, {
          status: String(payload.error?.error_code ?? "").length ? "FAILED" : "IN_PROGRESS",
          errorMessage: payload.error?.display_message || payload.error?.error_message || null,
          metadata: { lastWebhookType: eventType }
        });
      }
    }
    await completeWebhookEvent("PLAID", eventId);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plaid webhook processing failed.";
    await completeWebhookEvent("PLAID", eventId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
