import type Stripe from "stripe";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS, getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventCreated: number) {
  if (session.payment_status !== "paid") {
    return { ignored: "checkout session is not paid" };
  }

  const paymentId = session.metadata?.paymentId;
  if (!paymentId) {
    return { ignored: "checkout session is missing payment metadata" };
  }

  const payment = await db.payment.findFirst({ where: { id: paymentId } });
  if (!payment) {
    throw new Error(`Payment ${paymentId} was not found for Stripe session ${session.id}.`);
  }

  if (session.metadata?.unitId && payment.unitId !== session.metadata.unitId) {
    throw new Error(`Stripe session ${session.id} unit metadata does not match payment ${paymentId}.`);
  }

  if (session.metadata?.leaseId && payment.leaseId !== session.metadata.leaseId) {
    throw new Error(`Stripe session ${session.id} lease metadata does not match payment ${paymentId}.`);
  }

  const amountPaidCents = session.amount_total ?? 0;
  if (session.metadata?.amountCents && Number(session.metadata.amountCents) !== amountPaidCents) {
    throw new Error(`Stripe session ${session.id} amount does not match payment ${paymentId}.`);
  }
  const metadataApplicationFeeAmountCents = session.metadata?.applicationFeeAmountCents
    ? Number(session.metadata.applicationFeeAmountCents)
    : NaN;
  const applicationFeeAmountCents = Number.isFinite(metadataApplicationFeeAmountCents)
    ? metadataApplicationFeeAmountCents
    : NEXUS_STRIPE_APPLICATION_FEE_AMOUNT_CENTS;

  const paidAt = new Date(eventCreated * 1000);

  await db.payment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidDate: paidAt,
      balanceDue: 0,
      amountPaid: amountPaidCents > 0 ? amountPaidCents / 100 : payment.amount,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: getPaymentIntentId(session),
      stripeDestinationAccountId: session.metadata?.stripeDestinationAccountId,
      stripeApplicationFeeAmountCents: applicationFeeAmountCents,
      stripeAmountPaidCents: amountPaidCents,
      stripePaidAt: paidAt
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/transactions");

  return { updated: paymentId };
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
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.created);
      return Response.json({ received: true, ...result });
    }

    return Response.json({ received: true, ignored: event.type });
  } catch (error) {
    console.error("[stripe] Webhook handling failed", error);
    return Response.json({ error: "Stripe webhook handling failed." }, { status: 500 });
  }
}
