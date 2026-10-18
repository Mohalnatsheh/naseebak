import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { fulfilCheckoutSession, isOurSession } from "@/lib/payments/fulfil";
import { flagDispute, handleChargeRefunded } from "@/lib/payments/refund";
import type Stripe from "stripe";

export async function POST(request: Request) {
  let event: Stripe.Event;

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[payments] STRIPE_WEBHOOK_SECRET is not set: webhook events can't be verified");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Usually STRIPE_WEBHOOK_SECRET belongs to another endpoint of the shared Stripe account
    console.error("[payments] Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const outcome = await fulfilCheckoutSession(session);
        if (outcome === "not_paid") console.warn("Webhook: checkout not paid yet", session.id, session.payment_status);
        break;
      }

      // Abandoned (Stripe expires it after CHECKOUT_TTL_MS) or a delayed payment method failed
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { paymentId } = session.metadata || {};

        if (paymentId && isOurSession(session)) {
          // Never undo a payment that was already credited
          await db.payment.updateMany({
            where: { id: paymentId, status: "PENDING" },
            data: { status: "FAILED" },
          });
        }

        break;
      }

      // A refund made in the Stripe dashboard (or by the admin refund route): take the credits back
      case "charge.refunded": {
        const outcome = await handleChargeRefunded(event.data.object as Stripe.Charge);
        if (outcome !== "not_ours") console.log("[payments] charge.refunded:", event.data.object.id, outcome);
        break;
      }

      case "charge.dispute.created": {
        await flagDispute(event.data.object as Stripe.Dispute);
        break;
      }

      default:
        // The Stripe account also serves other sites: their events are expected here
        break;
    }
  } catch (err) {
    console.error("[payments] Webhook handler error:", event.type, event.id, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
