/**
 * Arabic payment page (owner request 2026-11-05): Stripe Checkout has no Arabic, so with the `arabic_checkout` switch
 * on, a purchase is a Stripe PaymentIntent paid on our own page `/pay/<paymentId>?t=<payToken>` (Payment Element,
 * locale `ar`, right to left, Naseebak's design). The page needs no sign-in — the app opens it in the phone's browser —
 * so the link carries a random token stored on the Payment row.
 *
 * Crediting mirrors `fulfilCheckoutSession`: the row is claimed (PENDING/FAILED → COMPLETED) in the same transaction as
 * the credit increment, so the four paths that call `fulfilPaymentIntent` — the webhook (`payment_intent.succeeded`),
 * the return page, the app's status check and the daily job — add the credits once. `providerTxId` = the intent id, so
 * refunds and disputes (`findPaymentForCharge`) work unchanged.
 *
 * Switch: "off" (default) | "test" (only test accounts, EXTRA_TEST_PHONES — for a first real payment) | "all".
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { isTestPhone } from "@/lib/test-accounts";
import { recordCredit } from "@/lib/credits";
import { notify } from "@/lib/notify";
import { CHECKOUT_APP, type FulfilResult } from "@/lib/payments/fulfil";
import { STATEMENT_SUFFIX, productName } from "@/lib/payments/checkout-branding";
import type { CreditPackage } from "@/lib/payments/packages";

export const ARABIC_CHECKOUT_KEY = "arabic_checkout";
export type ArabicCheckoutMode = "off" | "test" | "all";

export async function arabicCheckoutMode(): Promise<ArabicCheckoutMode> {
  const v = await getSetting(ARABIC_CHECKOUT_KEY);
  return v === "all" || v === "test" ? v : "off";
}

/** Whether this member pays on the Arabic page */
export async function usesArabicCheckout(phone: string | null | undefined): Promise<boolean> {
  const mode = await arabicCheckoutMode();
  return mode === "all" || (mode === "test" && isTestPhone(phone));
}

export function newPayToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time token check (the token is the only key to a payment page) */
export function tokenMatches(stored: string | null | undefined, given: string | null | undefined): boolean {
  if (!stored || !given) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `from`: where the member started (after paying, the app's members are sent back to the app, the website's to their balance) */
export function payPagePath(paymentId: string, token: string, from: "app" | "web"): string {
  return `/pay/${encodeURIComponent(paymentId)}?t=${encodeURIComponent(token)}&from=${from}`;
}

/** The PaymentIntent for one package; metadata matches the checkout sessions' (same webhook / refund handling) */
export function paymentIntentParams(
  pkg: Pick<CreditPackage, "id" | "name" | "credits" | "chargeCurrency" | "chargeAmount">,
  ids: { paymentId: string; userId: string },
): Stripe.PaymentIntentCreateParams {
  return {
    amount: pkg.chargeAmount,
    currency: pkg.chargeCurrency,
    automatic_payment_methods: { enabled: true },
    description: productName(pkg),
    statement_descriptor_suffix: STATEMENT_SUFFIX,
    metadata: { app: CHECKOUT_APP, paymentId: ids.paymentId, userId: ids.userId, packageId: pkg.id, credits: String(pkg.credits) },
  };
}

/** A Naseebak PaymentIntent (tagged like our checkout sessions) */
export function isOurIntent(intent: Pick<Stripe.PaymentIntent, "metadata">): boolean {
  const m = intent.metadata || {};
  return m.app === CHECKOUT_APP && !!m.paymentId && !!m.userId && !!m.credits;
}

export async function fulfilPaymentIntent(intent: Pick<Stripe.PaymentIntent, "id" | "status" | "metadata">): Promise<FulfilResult> {
  if (!isOurIntent(intent)) return "not_ours";
  if (intent.status !== "succeeded") return "not_paid";
  const { paymentId, userId, credits } = intent.metadata;
  const creditsNum = parseInt(credits, 10);
  if (!Number.isInteger(creditsNum) || creditsNum <= 0) {
    console.error("[payments] intent without usable metadata:", intent.id, intent.metadata);
    return "invalid";
  }
  const fulfilled = await db.$transaction(async (tx) => {
    const marked = await tx.payment.updateMany({
      // A FAILED row (timed out or cancelled while the bank was still confirming) is fulfilled too; never REFUNDED
      where: { id: paymentId, userId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "COMPLETED", providerTxId: intent.id, failureReason: null },
    });
    if (marked.count === 0) return false;
    await tx.user.update({ where: { id: userId }, data: { matchCredits: { increment: creditsNum } } });
    return true;
  });
  if (!fulfilled) return "already";
  await recordCredit({ userId, delta: creditsNum, reason: "PURCHASE", refId: paymentId });
  await notify({
    userId,
    type: "PAYMENT",
    title: "تم شراء الرصيد بنجاح",
    body: `تمت إضافة الأرصدة إلى حسابك (${creditsNum}).`,
    url: "/dashboard/payments",
  });
  return "fulfilled";
}

/** How far back the daily job looks for paid intents nobody credited (same as the Checkout reconcile) */
const RECONCILE_LOOKBACK_DAYS = 3;

/** Daily: every Naseebak PaymentIntent from the last days that succeeded gets credited (no-op when already done) */
export async function reconcilePaymentIntents(
  stripe: Pick<Stripe, "paymentIntents">,
  now = new Date(),
): Promise<{ checked: number; fulfilled: number }> {
  const since = Math.floor(now.getTime() / 1000) - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60;
  let checked = 0;
  let fulfilled = 0;
  for await (const intent of stripe.paymentIntents.list({ created: { gte: since }, limit: 100 })) {
    if (intent.status !== "succeeded" || !isOurIntent(intent)) continue;
    checked++;
    try {
      if ((await fulfilPaymentIntent(intent)) === "fulfilled") {
        fulfilled++;
        console.warn("[payments] daily check credited a paid intent the webhook missed:", intent.id);
      }
    } catch (error) {
      console.error("[payments] daily check failed for intent", intent.id, error);
    }
  }
  return { checked, fulfilled };
}
