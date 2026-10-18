/**
 * Adds the bought credits for a paid Stripe Checkout session, once. Three paths call it, so a buyer
 * gets the credits even if one of them never happens:
 * - the Stripe webhook (checkout.session.completed / async_payment_succeeded),
 * - the return page (`/api/payments/session-status`) when the buyer comes back,
 * - the daily job (`reconcileStripePayments`) for paid sessions nobody fulfilled.
 * The Payment row is claimed (status → COMPLETED) in the same transaction as the credit increment,
 * so running it twice, or from two paths at the same moment, adds the credits once.
 */
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { notify } from "@/lib/notify";
import { recordCredit } from "@/lib/credits";

export type FulfilResult = "fulfilled" | "already" | "not_paid" | "invalid" | "not_ours";

/** Set on every Naseebak checkout; the Stripe account also serves other sites */
export const CHECKOUT_APP = "naseebak";

/** A Naseebak checkout: tagged, or (older sessions) carrying our three metadata keys */
export function isOurSession(session: Stripe.Checkout.Session): boolean {
  const m = session.metadata || {};
  return m.app === CHECKOUT_APP || (!!m.paymentId && !!m.userId && !!m.credits);
}

export async function fulfilCheckoutSession(session: Stripe.Checkout.Session): Promise<FulfilResult> {
  // Another site's checkout on the same Stripe account: not ours to touch
  if (!isOurSession(session)) return "not_ours";
  // "completed" also fires for payments still being processed: credits only once the money is in
  if (session.payment_status !== "paid") return "not_paid";
  const { paymentId, userId, credits } = session.metadata || {};
  const creditsNum = credits ? parseInt(credits, 10) : NaN;
  if (!paymentId || !userId || !Number.isInteger(creditsNum) || creditsNum <= 0) {
    console.error("[payments] session without usable metadata:", session.id, session.metadata);
    return "invalid";
  }

  // A FAILED row (timed out in the app while the buyer was still paying) is fulfilled too
  const fulfilled = await db.$transaction(async (tx) => {
    const marked = await tx.payment.updateMany({
      // Never a REFUNDED row: a refunded session still reads "paid" in the daily reconcile
      where: { id: paymentId, userId, status: { in: ["PENDING", "FAILED"] } },
      data: {
        status: "COMPLETED",
        providerTxId: (typeof session.payment_intent === "string" && session.payment_intent) || session.id,
      },
    });
    if (marked.count === 0) return false;
    await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: creditsNum } } });
    return true;
  });
  if (!fulfilled) return "already";

  // Outside the transaction: a missing history row must never block a purchase
  await recordCredit({ userId, delta: creditsNum, reason: "PURCHASE", refId: paymentId });
  await notify({
    userId,
    type: "PAYMENT",
    title: "تم شراء الرصيد بنجاح",
    body: `تمت إضافة ${creditsNum} رصيد إلى حسابك.`,
    url: "/dashboard/payments",
  });
  return "fulfilled";
}

/** How far back the daily job looks (Stripe keeps a checkout payable for 24 hours) */
const RECONCILE_LOOKBACK_DAYS = 3;

/**
 * Daily: every Checkout session from the last few days that Stripe says is paid gets fulfilled
 * (a no-op for the ones already done). Catches a missed webhook when the buyer also never came back.
 */
export async function reconcileStripePayments(now = new Date()): Promise<{ checked: number; fulfilled: number }> {
  if (!process.env.STRIPE_SECRET_KEY) return { checked: 0, fulfilled: 0 };
  const since = Math.floor(now.getTime() / 1000) - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60;
  let checked = 0;
  let fulfilled = 0;
  for await (const session of getStripe().checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
    if (session.payment_status !== "paid" || !isOurSession(session)) continue;
    checked++;
    try {
      if ((await fulfilCheckoutSession(session)) === "fulfilled") {
        fulfilled++;
        console.warn("[payments] daily check credited a paid session the webhook missed:", session.id);
      }
    } catch (error) {
      console.error("[payments] daily check failed for", session.id, error);
    }
  }
  return { checked, fulfilled };
}
