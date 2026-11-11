/**
 * Refunds and disputes of Stripe payments, reflected in the app:
 * - `applyRefund`: a COMPLETED payment becomes REFUNDED once, the package's credits are taken back
 *   (floored at 0, ledger reason REFUND with a negative delta) and the buyer is told. Called by the
 *   admin refund route (after it refunds on Stripe) and by the webhook on `charge.refunded` (a refund
 *   made in the Stripe dashboard). Both paths together still deduct once (status claim).
 *   A Pro payment (`pro_<plan>`) takes back the credits granted from it instead (its `ProCreditGrant` rows, yearly: every
 *   monthly grant of that paid year), and a refund of the membership's latest payment ends Pro at once.
 * - `flagDispute`: `charge.dispute.created` marks the payment (`disputedAt`) and alerts the admins.
 */
import { PRO_REFUND_ENDED_LINE } from "@/lib/pro/notices";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { recordCredit } from "@/lib/credits";
import { sendAdminAlert } from "@/lib/admin-alert";
import type { CountryCode } from "@/lib/countries";
import { findAnyPackage, formatPaidAmount, fromMinor } from "@/lib/payments/packages";
import { PRO_PAGE_PATH, planFromName } from "@/lib/pro/plans";
import { cancelProNow, endProLocally } from "@/lib/pro/manage";
import { invoiceIdForPaymentIntent } from "@/lib/pro/invoice-payments";
import { chargeInvoiceId } from "@/lib/pro/stripe-shapes";

export type RefundResult = "refunded" | "already" | "not_found";

export async function applyRefund(args: {
  paymentId: string;
  adminId?: string;
  note?: string;
}): Promise<RefundResult> {
  const payment = await db.payment.findUnique({
    where: { id: args.paymentId },
    select: { id: true, status: true, userId: true, planName: true, amount: true, currency: true, chargeCurrency: true, proSubscriptionId: true },
  });
  if (!payment) return "not_found";
  if (payment.status === "REFUNDED") return "already";

  const proPlan = planFromName(payment.planName);
  // Also packages no longer sold: an older purchase gives back what it bought
  const pkg = proPlan ? undefined : findAnyPackage(payment.planName);
  const userId = payment.userId;

  const refunded = await db.$transaction(async (tx) => {
    // Pro: is this the membership's latest paid period? Read before the claim below changes this payment's status
    const latest =
      proPlan && payment.proSubscriptionId
        ? await tx.payment.findFirst({
            where: { proSubscriptionId: payment.proSubscriptionId, status: "COMPLETED" },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        : null;

    // COMPLETED guard: a concurrent refund (admin + webhook) of the same payment only deducts once
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count !== 1) return null;

    let creditsToDeduct = pkg?.credits ?? 0;
    if (proPlan) {
      // Every grant made from this payment and not taken back yet, in the same transaction as the claim
      const grants = await tx.proCreditGrant.findMany({
        where: { paymentId: payment.id, takenBack: false },
        select: { id: true, credits: true },
      });
      if (grants.length > 0) {
        await tx.proCreditGrant.updateMany({
          where: { id: { in: grants.map((g) => g.id) }, takenBack: false },
          data: { takenBack: true },
        });
      }
      creditsToDeduct = grants.reduce((sum, g) => sum + g.credits, 0);
    }

    let deducted = false;
    if (userId && creditsToDeduct > 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
      if (user) {
        const before = user.matchCredits;
        const after = Math.max(0, before - creditsToDeduct); // floor at 0
        if (after !== before) {
          deducted = true;
          await tx.user.update({ where: { id: userId }, data: { matchCredits: after } });
          await recordCredit(
            {
              userId,
              delta: after - before,
              reason: "REFUND",
              refId: payment.id,
              ...(args.adminId && { adminId: args.adminId }),
              note: args.note ?? "Stripe refund",
            },
            tx,
          );
        }
      }
    }
    return { endsPro: !!latest && latest.id === payment.id, deducted };
  });
  if (!refunded) return "already";

  if (refunded.endsPro && payment.proSubscriptionId) {
    // The refund is committed: nothing after it may throw, or the member would get no notice and a retry says "already"
    try {
      await endProAfterRefund(payment.proSubscriptionId, payment, args.adminId);
    } catch (e) {
      console.error("[pro] refund: ending Pro failed", payment.proSubscriptionId, e);
    }
  }

  if (userId) {
    await notify({
      userId,
      type: "PAYMENT",
      title: "تم استرداد المبلغ",
      // Charged in USD (shown in JOD): say what actually goes back to the card
      body: proPlan
        ? [
            refunded.deducted
              ? `تم استرداد ${formatPaidAmount(payment)} من اشتراك Pro إلى بطاقتك، وأُزيل رصيده من حسابك.`
              : // Nothing was taken back (the payment granted nothing, or the balance was already 0)
                `تم استرداد ${formatPaidAmount(payment)} من اشتراك Pro إلى بطاقتك.`,
            // It paid the current period: Pro ended with it (QA WP2-04)
            ...(refunded.endsPro && payment.proSubscriptionId ? [PRO_REFUND_ENDED_LINE] : []),
          ].join(" ")
        : pkg
          ? `تم استرداد ${formatPaidAmount(payment)} (قيمة باقة ${pkg.name}) إلى بطاقتك، وأُزيل رصيد الباقة من حسابك.`
          : "تم استرداد قيمة عملية الدفع إلى بطاقتك.",
      // A Pro refund opens the Pro page (app 1.0.x falls back to its credits screen by the type)
      url: proPlan ? PRO_PAGE_PATH : "/dashboard/payments",
      metadata: { paymentId: payment.id },
      ...(proPlan ? { sms: false as const } : {}),
    });
  }
  return "refunded";
}

/**
 * The refunded payment paid the current period: Pro ends at once, on Stripe too. The refund is already recorded, so a
 * Stripe failure here still ends Pro locally and asks the admins to cancel the subscription in Stripe by hand.
 */
async function endProAfterRefund(subscriptionId: string, payment: { id: string; userId: string | null; currency: string }, adminId?: string) {
  try {
    await cancelProNow(subscriptionId, { reason: "refund", ...(adminId && { adminId }) });
  } catch (e) {
    console.error("[pro] refund: Stripe cancel failed", subscriptionId, e);
    await endProLocally(subscriptionId).catch((err) => console.error("[pro] refund: local end failed", subscriptionId, err));
    const sub = await db.proSubscription
      .findUnique({ where: { id: subscriptionId }, select: { stripeSubscriptionId: true } })
      .catch(() => null);
    await sendAdminAlert(
      "Pro refund: cancel the subscription in Stripe",
      `Payment ${payment.id} was refunded and Pro ended here, but cancelling Stripe subscription ` +
        `${sub?.stripeSubscriptionId ?? "?"} failed. Cancel it in the Stripe dashboard so it does not renew.`,
      alertAbout(payment),
    ).catch((err) => console.error("[pro] refund alert failed", err));
  }
}

/**
 * Our Payment row for a Stripe charge. Packages store the payment intent id as providerTxId (fulfil); a Pro payment
 * stores its invoice id: an older-API payload names it on the charge, otherwise the payment intent's invoice is looked up.
 */
export async function findPaymentForCharge(charge: Pick<Stripe.Charge, "payment_intent">) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return null;
  const select = { id: true, status: true, userId: true, amount: true, currency: true, planName: true } as const;
  const byIntent = await db.payment.findFirst({ where: { providerTxId: pi, provider: "STRIPE" }, select });
  if (byIntent) return byIntent;
  let invoiceId = chargeInvoiceId(charge);
  if (!invoiceId) {
    try {
      invoiceId = await invoiceIdForPaymentIntent(pi);
    } catch (e) {
      // The account is shared: most charges here are another site's. A failed lookup (Stripe down, a restricted key)
      // must not turn their events into 500s and retries; it is logged and treated as not ours
      console.error("[stripe] invoice lookup for a charge failed, treated as not ours:", pi, (e as Error)?.message ?? e);
      return null;
    }
  }
  if (!invoiceId) return null;
  return db.payment.findFirst({ where: { providerTxId: invoiceId, provider: "STRIPE" }, select });
}

/** Without the member (account deleted), the payment's currency tells its country (JO stores JOD, SA SAR, LB USD) */
const ALERT_COUNTRY: Record<string, CountryCode> = { JOD: "JO", SAR: "SA", USD: "LB" };
/** Who the admin alert is about: the member's own country first, the currency only once the account is gone */
const alertAbout = (payment: { userId: string | null; currency: string }) =>
  payment.userId ? { userId: payment.userId } : { country: ALERT_COUNTRY[payment.currency] ?? "JO" };

/** `charge.refunded`: full refund → applyRefund; partial refund → admin alert only */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<RefundResult | "partial" | "not_ours"> {
  const payment = await findPaymentForCharge(charge);
  if (!payment) return "not_ours"; // another site on the shared Stripe account
  if (!charge.refunded) {
    await sendAdminAlert(
      "Partial Stripe refund",
      `Payment ${payment.id} (user ${payment.userId ?? "deleted"}) was partly refunded in Stripe ` +
        `(${fromMinor(charge.amount_refunded, charge.currency).toFixed(2)} of ${fromMinor(charge.amount, charge.currency).toFixed(2)} ${charge.currency.toUpperCase()}). ` +
        "Credits were not changed — adjust them in Admin → Users if needed.",
      alertAbout(payment),
    );
    return "partial";
  }
  return applyRefund({ paymentId: payment.id, note: "Refunded in Stripe" });
}

/** `charge.dispute.created`: flag the payment and alert the admins (credits are left as they are) */
export async function flagDispute(dispute: Stripe.Dispute): Promise<"flagged" | "not_ours"> {
  const payment = await findPaymentForCharge(dispute);
  if (!payment) return "not_ours";
  await db.payment.updateMany({
    where: { id: payment.id, disputedAt: null },
    data: { disputedAt: new Date() },
  });
  await sendAdminAlert(
    "Stripe dispute opened",
    `A dispute (${dispute.reason}, ${fromMinor(dispute.amount, dispute.currency).toFixed(2)} ${dispute.currency.toUpperCase()}) was opened on ` +
      `payment ${payment.id} (user ${payment.userId ?? "deleted"}, package ${payment.planName ?? "?"}). ` +
      "Respond in the Stripe dashboard before the deadline. Credits were not changed.",
    alertAbout(payment),
  );
  return "flagged";
}
