import type Stripe from "stripe";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { recordPlatformEvent } from "@/lib/platform-events";
import { nowIso, updateStore } from "@/lib/store";
import { getPlatformFeeCents, getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
}

// Ownership guard: Stripe metadata is not trusted on its own. Each payment is
// loaded locally (with its unit -> property -> organization chain) and must
// belong to the organization and manager named in the session metadata before
// it can be marked paid. Mismatches throw, so the event is recorded as failed
// and nothing is written.
async function loadVerifiedPayment(paymentId: string, sessionId: string, sessionOrganizationId?: string) {
  const payment = await db.payment.findFirst({ where: { id: paymentId }, include: true });
  if (!payment) {
    throw new Error(`Payment ${paymentId} was not found for Stripe session ${sessionId}.`);
  }
  const paymentOrganizationId = payment.unit?.property?.organizationId;
  if (sessionOrganizationId && paymentOrganizationId && sessionOrganizationId !== paymentOrganizationId) {
    throw new Error(`Stripe session ${sessionId} organization metadata does not match payment ${paymentId}.`);
  }
  return payment;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventCreated: number) {
  if (session.payment_status !== "paid") {
    return { ignored: "checkout session is not paid" };
  }

  const paymentIdsStr = session.metadata?.paymentIds;
  const singlePaymentId = session.metadata?.paymentId;

  const paymentIds = paymentIdsStr
    ? paymentIdsStr.split(",").filter(Boolean)
    : singlePaymentId
      ? [singlePaymentId]
      : [];

  if (!paymentIds.length) {
    return { ignored: "checkout session is missing payment metadata" };
  }

  const paidAt = new Date(eventCreated * 1000);
  const paidAtIso = paidAt.toISOString();
  const metadataApplicationFeeAmountCents = session.metadata?.applicationFeeAmountCents
    ? Number(session.metadata.applicationFeeAmountCents)
    : NaN;
  const applicationFeeAmountCents = Number.isFinite(metadataApplicationFeeAmountCents)
    ? metadataApplicationFeeAmountCents
    : getPlatformFeeCents();
  const paymentIntentId = getPaymentIntentId(session);
  const sessionId = session.id;
  const destinationAccountId = session.metadata?.stripeDestinationAccountId || undefined;
  const tenantId = session.metadata?.tenantId || undefined;
  const sessionOrganizationId = session.metadata?.organizationId || undefined;
  const managerUserId = session.metadata?.managerUserId || undefined;

  if (managerUserId) {
    const manager = await db.user.findUnique({ where: { id: managerUserId } });
    if (!manager) {
      throw new Error(`Stripe session ${sessionId} references manager ${managerUserId} that does not exist.`);
    }
    if (sessionOrganizationId && manager.organizationId !== sessionOrganizationId) {
      throw new Error(`Stripe session ${sessionId} manager does not belong to the session organization.`);
    }
  }

  if (paymentIds.length === 1) {
    const paymentId = paymentIds[0];
    const payment = await loadVerifiedPayment(paymentId, sessionId, sessionOrganizationId);

    if (session.metadata?.unitId && payment.unitId !== session.metadata.unitId) {
      throw new Error(`Stripe session ${sessionId} unit metadata does not match payment ${paymentId}.`);
    }

    // Idempotency: never double-write a paid record. A repeat delivery of the
    // same session is a no-op; a different session for an already-paid record
    // must not overwrite the original settlement details.
    if (payment.status === "PAID") {
      return {
        ignored:
          payment.stripeCheckoutSessionId === sessionId
            ? `payment ${paymentId} already marked paid for this session`
            : `payment ${paymentId} already paid via a different session; not overwritten`
      };
    }

    const amountPaidCents = session.amount_total ?? 0;
    // amount_total includes the platform fee charged on top of rent; the ledger
    // should record the rent portion that the payment actually settles.
    const rentPaidCents = Math.max(0, amountPaidCents - applicationFeeAmountCents);

    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "PAID",
        ...(!payment.tenantId && tenantId ? { tenantId } : {}),
        paidDate: paidAt,
        balanceDue: 0,
        amountPaid: rentPaidCents > 0 ? rentPaidCents / 100 : payment.amount,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
        stripeDestinationAccountId: destinationAccountId,
        stripeApplicationFeeAmountCents: applicationFeeAmountCents,
        stripeAmountPaidCents: amountPaidCents,
        stripePaidAt: paidAt
      }
    });
  } else {
    // Verify ownership of every payment in the bundle before writing anything,
    // and skip records that are already paid so retries cannot double-write.
    const eligiblePaymentIds: string[] = [];
    for (const paymentId of paymentIds) {
      const payment = await loadVerifiedPayment(paymentId, sessionId, sessionOrganizationId);
      if (payment.status !== "PAID") {
        eligiblePaymentIds.push(paymentId);
      }
    }

    if (!eligiblePaymentIds.length) {
      return { ignored: "all payments in this session are already marked paid" };
    }

    await updateStore((store) => ({
      ...store,
      payments: store.payments.map((p) => {
        if (!eligiblePaymentIds.includes(p.id)) return p;
        return {
          ...p,
          status: "PAID" as const,
          ...(!p.tenantId && tenantId ? { tenantId } : {}),
          paidDate: paidAtIso,
          balanceDue: 0,
          amountPaid: p.balanceDue || p.amount,
          stripeCheckoutSessionId: sessionId,
          stripePaymentIntentId: paymentIntentId,
          stripeDestinationAccountId: destinationAccountId,
          stripeApplicationFeeAmountCents: applicationFeeAmountCents,
          stripeAmountPaidCents: Math.round((p.balanceDue || p.amount) * 100),
          stripePaidAt: paidAtIso,
          updatedAt: nowIso()
        };
      })
    }));
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");

  return { updated: paymentIds.join(",") };
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const payload = await request.text();
    event = getStripe().webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
  } catch (error) {
    console.error("[stripe] Webhook signature verification failed", error);
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    let result: Record<string, string> = { ignored: event.type };
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      result = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.created);
    }

    await recordPlatformEvent({
      type: "STRIPE_WEBHOOK_RECEIVED",
      category: event.type,
      status: "updated" in result ? "success" : "ignored",
      relatedId: event.id,
      message: "Verified Stripe webhook processed.",
      metadata: {
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
        outcome: "updated" in result ? result.updated : result.ignored
      }
    });

    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error("[stripe] Webhook handling failed", error);
    await recordPlatformEvent({
      type: "STRIPE_WEBHOOK_FAILED",
      category: event.type,
      status: "failed",
      relatedId: event.id,
      message: error instanceof Error ? error.message.slice(0, 500) : "Stripe webhook handling failed.",
      metadata: {
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode
      }
    });
    return Response.json({ error: "Stripe webhook handling failed." }, { status: 500 });
  }
}
