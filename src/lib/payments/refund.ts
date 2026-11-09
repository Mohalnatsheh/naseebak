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
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { recordCredit } from "@/lib/credits";
import { sendAdminAlert } from "@/lib/admin-alert";
import { findAnyPackage, formatPaidCharge } from "@/lib/payments/packages";
import { planFromName } from "@/lib/pro/plans";
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
    select: { id: true, status: true, userId: true, planName: true, amount: true, currency: true, proSubscriptionId: true },
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

    if (userId && creditsToDeduct > 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { matchCredits: true } });
      if (user) {
        const before = user.matchCredits;
        const after = Math.max(0, before - creditsToDeduct); // floor at 0
        if (after !== before) {
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
    return { endsPro: !!latest && latest.id === payment.id };
  });
  if (!refunded) return "already";

  if (refunded.endsPro && payment.proSubscriptionId) await endProAfterRefund(payment.proSubscriptionId, payment, args.adminId);

  if (userId) {
    await notify({
      userId,
      type: "PAYMENT",
      title: "تم استرداد المبلغ",
      // Charged in USD (shown in JOD): say what actually goes back to the card
      body: proPlan
        ? `تم استرداد ${formatPaidCharge(payment)} من اشتراك Pro إلى بطاقتك، وأُزيل رصيده من حسابك.`
        : pkg
          ? `تم استرداد ${formatPaidCharge(payment)} (قيمة باقة ${pkg.name}) إلى بطاقتك، وأُزيل رصيد الباقة من حسابك.`
          : "تم استرداد قيمة عملية الدفع إلى بطاقتك.",
      url: "/dashboard/payments",
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
async function endProAfterRefund(subscriptionId: string, payment: { id: string; currency: string }, adminId?: string) {
  try {
    await cancelProNow(subscriptionId, { reason: "refund", ...(adminId && { adminId }) });
  } catch (e) {
    console.error("[pro] refund: Stripe cancel failed", subscriptionId, e);
    await endProLocally(subscriptionId);
    const sub = await db.proSubscription.findUnique({ where: { id: subscriptionId }, select: { stripeSubscriptionId: true } });
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
  const invoiceId = chargeInvoiceId(charge) ?? (await invoiceIdForPaymentIntent(pi));
  if (!invoiceId) return null;
  return db.payment.findFirst({ where: { providerTxId: invoiceId, provider: "STRIPE" }, select });
}

/** A payment's currency tells its country, also once the account is deleted */
const alertAbout = (payment: { currency: string }) => ({ country: payment.currency === "SAR" ? "SA" : "JO" });

/** `charge.refunded`: full refund → applyRefund; partial refund → admin alert only */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<RefundResult | "partial" | "not_ours"> {
  const payment = await findPaymentForCharge(charge);
  if (!payment) return "not_ours"; // another site on the shared Stripe account
  if (!charge.refunded) {
    await sendAdminAlert(
      "Partial Stripe refund",
      `Payment ${payment.id} (user ${payment.userId ?? "deleted"}) was partly refunded in Stripe ` +
        `(${(charge.amount_refunded / 100).toFixed(2)} of ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}). ` +
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
    `A dispute (${dispute.reason}, ${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}) was opened on ` +
      `payment ${payment.id} (user ${payment.userId ?? "deleted"}, package ${payment.planName ?? "?"}). ` +
      "Respond in the Stripe dashboard before the deadline. Credits were not changed.",
    alertAbout(payment),
  );
  return "flagged";
}
