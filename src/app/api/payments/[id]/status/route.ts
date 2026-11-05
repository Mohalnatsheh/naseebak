import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/payments/fulfil";
import { fulfilPaymentIntent } from "@/lib/payments/intent";
import { MOCK_SESSION_PREFIX } from "@/lib/payments/mock";

/**
 * A payment of the signed-in member, by id (the app polls this after the checkout page). While it is PENDING and a
 * real Stripe session exists, Stripe is asked and a paid session is fulfilled here (once, whichever path comes first —
 * same as `/api/payments/session-status`). Returns the member's balance so the app can refresh it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;
    const { id } = await params;

    let payment = await db.payment.findFirst({
      where: { id, userId },
      select: { id: true, status: true, stripeSessionId: true, stripePaymentIntentId: true, planName: true, amount: true, currency: true, createdAt: true },
    });
    if (!payment) return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    // Arabic payment page: ask Stripe about the PaymentIntent (credits once, like the other paths)
    if (payment.status !== "COMPLETED" && payment.stripePaymentIntentId && process.env.STRIPE_SECRET_KEY) {
      try {
        const intent = await getStripe().paymentIntents.retrieve(payment.stripePaymentIntentId);
        if (intent.metadata?.userId === userId && intent.status === "succeeded") {
          await fulfilPaymentIntent(intent);
          payment = await db.payment.findFirst({
            where: { id, userId },
            select: { id: true, status: true, stripeSessionId: true, stripePaymentIntentId: true, planName: true, amount: true, currency: true, createdAt: true },
          });
        }
      } catch (error) {
        console.error("[payments] status check (intent) failed:", id, error);
      }
    }

    const sessionId = payment?.status === "PENDING" ? payment.stripeSessionId : null;
    if (sessionId && !sessionId.startsWith(MOCK_SESSION_PREFIX) && process.env.STRIPE_SECRET_KEY) {
      try {
        const session = await getStripe().checkout.sessions.retrieve(sessionId);
        if (session.metadata?.userId === userId && session.payment_status === "paid") {
          await fulfilCheckoutSession(session);
          payment = await db.payment.findFirst({
            where: { id, userId },
            select: { id: true, status: true, stripeSessionId: true, stripePaymentIntentId: true, planName: true, amount: true, currency: true, createdAt: true },
          });
        }
      } catch (error) {
        console.error("[payments] status check failed:", id, error);
      }
    }

    const me = await db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
    return NextResponse.json({
      payment: {
        id: payment!.id,
        status: payment!.status,
        packageId: payment!.planName,
        amount: Number(payment!.amount),
        currency: payment!.currency,
        createdAt: payment!.createdAt,
      },
      credits: me?.matchCredits ?? 0,
    });
  } catch (error) {
    console.error("[payments] status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
