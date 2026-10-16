import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import type Stripe from "stripe";

export async function POST(request: Request) {
  let event: Stripe.Event;

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
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { paymentId, userId, credits } = session.metadata || {};

        if (!paymentId || !userId || !credits) {
          console.error("Webhook missing metadata:", session.metadata);
          break;
        }

        const creditsNum = parseInt(credits, 10);

        // Mark COMPLETED once — Stripe may deliver the same event more than once
        const marked = await db.payment.updateMany({
          where: { id: paymentId, status: { not: "COMPLETED" } },
          data: {
            status: "COMPLETED",
            providerTxId: (session.payment_intent as string) || session.id,
          },
        });
        if (marked.count === 0) break;

        // Add credits to user
        await db.user.update({
          where: { id: userId },
          data: { matchCredits: { increment: creditsNum } },
        });

        // Create notification
        await db.notification.create({
          data: {
            userId,
            type: "PAYMENT",
            title: "تم شراء الرصيد بنجاح",
            body: `تمت إضافة ${creditsNum} رصيد إلى حسابك.`,
          },
        });

        // Push notification (fire and forget)
        sendPushNotification({
          userId,
          title: "تم شراء الرصيد بنجاح",
          body: `تمت إضافة ${creditsNum} رصيد إلى حسابك.`,
          url: "/dashboard/payments",
        });

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { paymentId } = session.metadata || {};

        if (paymentId) {
          await db.payment.update({
            where: { id: paymentId },
            data: { status: "FAILED" },
          });
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
