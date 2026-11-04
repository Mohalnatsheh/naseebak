/**
 * Why a checkout failed (`Payment.failureReason`, admin → Payments; owner request 2026-11-04):
 * - DECLINED[:<code>]  a card was tried and Stripe refused it (code = Stripe's decline_code / error code)
 * - CANCELLED          the member went back from the checkout («رجوع» / «إلغاء», POST /api/payments/cancel)
 * - EXPIRED            the checkout was left open until Stripe closed it
 * - ASYNC_FAILED       a delayed payment method failed after the checkout
 * - NOT_PAID           filled in later for an older row: closed without paying (cancel and expiry look the same)
 * A tried-and-refused card wins over the way the checkout ended.
 */
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export { FAILURE_LABELS, FAILURE_REASONS } from "@/lib/payments/failure-labels";

/** The decline seen on the session's payment, or null when no card was refused */
export function declineOf(intent: Pick<Stripe.PaymentIntent, "last_payment_error"> | null | undefined): string | null {
  const e = intent?.last_payment_error;
  if (!e) return null;
  const code = e.decline_code || e.code;
  return code ? `DECLINED:${code}` : "DECLINED";
}

/**
 * The reason for a session that ended unpaid; `fallback` is how it ended when no card was refused.
 * Never throws: an unreachable Stripe gives the fallback.
 */
export async function failureReasonFor(
  session: Pick<Stripe.Checkout.Session, "payment_intent"> | null | undefined,
  fallback: "CANCELLED" | "EXPIRED" | "ASYNC_FAILED" | "NOT_PAID",
): Promise<string> {
  try {
    const pi = session?.payment_intent;
    if (!pi) return fallback;
    const intent = typeof pi === "string" ? await getStripe().paymentIntents.retrieve(pi) : pi;
    return declineOf(intent) ?? fallback;
  } catch {
    return fallback;
  }
}
