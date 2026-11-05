import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { CHECKOUT_TTL_MS } from "@/lib/payments/packages";
import { declineOf, failureReasonFor } from "@/lib/payments/failure";
import { fulfilPaymentIntent } from "@/lib/payments/intent";

/**
 * «رجوع» / «إلغاء» on a checkout: expires its Stripe session (so it can no longer be paid) and marks
 * the row FAILED. If Stripe says it was paid in the meantime, the credits are added instead.
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json().catch(() => ({}));
    const paymentId: unknown = body?.paymentId;

    if (typeof paymentId === "string" && paymentId) {
      const payment = await db.payment.findFirst({
        where: { id: paymentId, userId: session.user.id, status: "PENDING" },
        select: { id: true, stripeSessionId: true, stripePaymentIntentId: true },
      });
      if (!payment) return NextResponse.json({ success: true });

      // Arabic payment page: a paid intent is credited; one the bank is still confirming is left alone;
      // anything else is cancelled at Stripe (so it can't be paid later) and marked with its reason
      if (payment.stripePaymentIntentId && process.env.STRIPE_SECRET_KEY) {
        const stripe = getStripe();
        let intent: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>> | null = null;
        try {
          intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
        } catch (error) {
          console.error("[payments] cancel: could not read intent", payment.stripePaymentIntentId, error);
        }
        if (intent?.status === "succeeded") {
          await fulfilPaymentIntent(intent);
          return NextResponse.json({ success: true, paid: true });
        }
        if (intent?.status === "processing") return NextResponse.json({ success: true });
        if (intent && intent.status !== "canceled") {
          try {
            await stripe.paymentIntents.cancel(intent.id);
          } catch (error) {
            console.error("[payments] cancel: could not cancel intent", intent.id, error);
          }
        }
        await db.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "FAILED", failureReason: declineOf(intent) ?? "CANCELLED" },
        });
        return NextResponse.json({ success: true });
      }

      let failureReason = "CANCELLED";
      if (payment.stripeSessionId && process.env.STRIPE_SECRET_KEY) {
        const stripe = getStripe();
        try {
          await stripe.checkout.sessions.expire(payment.stripeSessionId);
        } catch (error) {
          // Already complete or expired: check whether the money came in before failing the row
          const cs = await stripe.checkout.sessions.retrieve(payment.stripeSessionId).catch(() => null);
          if (cs?.payment_status === "paid") {
            await fulfilCheckoutSession(cs);
            return NextResponse.json({ success: true, paid: true });
          }
          if (cs?.status === "open") {
            // Still payable and could not be closed: leave the row pending (Stripe expires it soon)
            console.error("[payments] could not expire checkout session", payment.stripeSessionId, error);
            return NextResponse.json({ success: true });
          }
        }
      }
      if (payment.stripeSessionId?.startsWith("cs_") && process.env.STRIPE_SECRET_KEY) {
        // A card refused before the member went back is the real reason
        let cs: Awaited<ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["retrieve"]>> | null = null;
        try {
          cs = await getStripe().checkout.sessions.retrieve(payment.stripeSessionId);
        } catch {
          // Unknown: it was still a member's cancel
        }
        failureReason = await failureReasonFor(cs, "CANCELLED");
      }
      await db.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED", failureReason },
      });
    } else {
      // No id (older page): only rows whose checkout is already over
      await db.payment.updateMany({
        where: {
          userId: session.user.id,
          status: "PENDING",
          createdAt: { lt: new Date(Date.now() - CHECKOUT_TTL_MS) },
        },
        data: { status: "FAILED", failureReason: "EXPIRED" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel payment error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
