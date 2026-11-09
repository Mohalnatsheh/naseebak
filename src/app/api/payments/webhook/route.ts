import { NextResponse } from "next/server";
import { declineOf, failureReasonFor } from "@/lib/payments/failure";
import { fulfilPaymentIntent, isOurIntent } from "@/lib/payments/intent";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { fulfilCheckoutSession, isOurSession } from "@/lib/payments/fulfil";
import { flagDispute, handleChargeRefunded } from "@/lib/payments/refund";
import { handleProCheckoutCompleted, handleProInvoiceFailed, handleProInvoicePaid, handleProSubscriptionChanged } from "@/lib/pro/stripe-events";
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
    // The detail stays in the log; the caller only learns the signature was refused (QA WEB-PAY-17)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Arabic payment page (lib/payments/intent): PaymentIntents paid on /pay/<id>. Intents made by Checkout carry
      // no Naseebak metadata, so these never touch a Checkout payment.
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (isOurIntent(intent)) await fulfilPaymentIntent(intent);
        break;
      }
      // A card was refused: the member may try another on the same page, so the row stays PENDING with the reason
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const reason = declineOf(intent);
        if (isOurIntent(intent) && reason) {
          await db.payment.updateMany({ where: { id: intent.metadata.paymentId, status: "PENDING" }, data: { failureReason: reason } });
        }
        break;
      }
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (isOurIntent(intent)) {
          await db.payment.updateMany({
            where: { id: intent.metadata.paymentId, status: "PENDING" },
            data: { status: "FAILED", failureReason: declineOf(intent) ?? "CANCELLED" },
          });
        }
        break;
      }
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // A subscription (Pro) never goes into the credit-package path; another site's one is ignored there too
        if (session.mode === "subscription") {
          await handleProCheckoutCompleted(session);
          break;
        }
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
          const failureReason = await failureReasonFor(session, event.type === "checkout.session.expired" ? "EXPIRED" : "ASYNC_FAILED");
          // Never undo a payment that was already credited
          await db.payment.updateMany({
            where: { id: paymentId, status: "PENDING" },
            data: { status: "FAILED", failureReason },
          });
          // Cancelled in the app/site first: the row is FAILED already; keep CANCELLED unless a card was refused
          if (failureReason.startsWith("DECLINED")) {
            await db.payment.updateMany({ where: { id: paymentId, status: "FAILED" }, data: { failureReason } });
          }
        }

        break;
      }

      // A refund made in the Stripe dashboard (or by the admin refund route): take the credits back
      case "charge.refunded": {
        const outcome = await handleChargeRefunded(event.data.object as Stripe.Charge);
        if (outcome !== "not_ours") console.log("[payments] charge.refunded:", event.data.object.id, outcome);
        break;
      }

      // Pro membership (lib/pro/stripe-events): each handler ignores anything without our Pro marker
      case "invoice.paid": {
        const outcome = await handleProInvoicePaid(event.data.object as Stripe.Invoice);
        if (outcome !== "not_ours") console.log("[pro] invoice.paid:", event.data.object.id, outcome);
        break;
      }
      case "invoice.payment_failed": {
        const outcome = await handleProInvoiceFailed(event.data.object as Stripe.Invoice);
        if (outcome !== "not_ours") console.log("[pro] invoice.payment_failed:", event.data.object.id, outcome);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const kind = event.type === "customer.subscription.deleted" ? "deleted" : "updated";
        const outcome = await handleProSubscriptionChanged(event.data.object as Stripe.Subscription, kind);
        if (outcome !== "not_ours") console.log(`[pro] subscription ${kind}:`, event.data.object.id, outcome);
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
