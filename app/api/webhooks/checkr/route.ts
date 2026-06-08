import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getCheckrReport,
  normalizeCheckrReport,
  verifyCheckrWebhook
} from "@/lib/screening/checkr";
import {
  completeWebhookEvent,
  findCheckrRequestByProviderId,
  recordWebhookEvent,
  redactProviderPayload,
  saveCheckrReport,
  saveScreeningResult,
  updateScreeningRequest
} from "@/lib/screening/repository";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-checkr-signature") ||
    request.headers.get("checkr-signature") ||
    request.headers.get("x-checkr-webhook-signature");
  if (!verifyCheckrWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Checkr webhook signature." }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }

  const eventId = String(payload.id || createHash("sha256").update(rawBody).digest("hex"));
  const eventType = String(payload.type || "unknown");
  const event = await recordWebhookEvent({
    provider: "CHECKR",
    providerEventId: eventId,
    eventType,
    rawBody,
    payload: redactProviderPayload(payload)
  });
  if (!event.isNew) return NextResponse.json({ received: true, duplicate: true });

  try {
    const object = payload.data?.object ?? payload.data ?? {};
    const providerIds = [
      object.report_id,
      object.id,
      object.candidate_id,
      object.invitation_id
    ].filter(Boolean);
    let screeningRequest = null;
    for (const providerId of providerIds) {
      screeningRequest = await findCheckrRequestByProviderId(String(providerId));
      if (screeningRequest) break;
    }

    if (screeningRequest) {
      const reportId = String(object.report_id || (eventType.startsWith("report.") ? object.id : "") || "");
      if (reportId) {
        const report = await getCheckrReport(reportId);
        const normalized = normalizeCheckrReport(report);
        await saveCheckrReport({
          applicationId: screeningRequest.applicationId,
          requestId: screeningRequest.id,
          candidateId: report.candidate_id ?? object.candidate_id,
          reportId,
          status: String(report.status ?? "pending"),
          result: report.result,
          adjudication: report.adjudication,
          assessment: report.assessment,
          completedAt: report.completed_at,
          rawResponse: redactProviderPayload(report),
          normalizedResult: normalized
        });
        await saveScreeningResult({
          applicationId: screeningRequest.applicationId,
          requestId: screeningRequest.id,
          provider: "CHECKR",
          status: normalized.status,
          providerResultId: reportId,
          rawResponse: redactProviderPayload(report),
          normalizedResult: normalized
        });
        await updateScreeningRequest(screeningRequest.id, {
          status: normalized.status,
          providerRequestId: reportId
        });
      } else {
        await updateScreeningRequest(screeningRequest.id, {
          status: eventType.includes("completed") ? "COMPLETED" : "IN_PROGRESS",
          providerRequestId: String(object.id || "")
        });
      }
    }
    await completeWebhookEvent("CHECKR", eventId);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkr webhook processing failed.";
    await completeWebhookEvent("CHECKR", eventId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
