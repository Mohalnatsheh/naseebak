/**
 * Refunds and disputes of Stripe payments, reflected in the app:
 * - `applyRefund`: a COMPLETED payment becomes REFUNDED once, the package's credits are taken back
 *   (floored at 0, ledger reason REFUND with a negative delta) and the buyer is told. Called by the
 *   admin refund route (after it refunds on Stripe) and by the webhook on `charge.refunded` (a refund
 *   made in the Stripe dashboard). Both paths together still deduct once (status claim).
 * - `flagDispute`: `charge.dispute.created` marks the payment (`disputedAt`) and alerts the admins.
 */
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { recordCredit } from "@/lib/credits";
import { sendAdminAlert } from "@/lib/admin-alert";
import { findPackage, formatUsd } from "@/lib/payments/packages";

export type RefundResult = "refunded" | "already" | "not_found";

export async function applyRefund(args: {
  paymentId: string;
  adminId?: string;
  note?: string;
}): Promise<RefundResult> {
  const payment = await db.payment.findUnique({
    where: { id: args.paymentId },
    select: { id: true, status: true, userId: true, planName: true },
  });
  if (!payment) return "not_found";
  if (payment.status === "REFUNDED") return "already";

  const pkg = findPackage(payment.planName);
  const creditsToDeduct = pkg?.credits ?? 0;
  const userId = payment.userId;

  const refunded = await db.$transaction(async (tx) => {
    // COMPLETED guard: a concurrent refund (admin + webhook) of the same payment only deducts once
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "COMPLETED" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count !== 1) return false;

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
    return true;
  });
  if (!refunded) return "already";

  if (userId) {
    await notify({
      userId,
      type: "PAYMENT",
      title: "تم استرداد المبلغ",
      // Charged in USD (shown in JOD): say what actually goes back to the card
      body: pkg
        ? `تم استرداد ${formatUsd(pkg.priceUsdCents)} (قيمة باقة ${pkg.name}) إلى بطاقتك، وأُزيل رصيد الباقة من حسابك.`
        : "تم استرداد قيمة عملية الدفع إلى بطاقتك.",
      url: "/dashboard/payments",
      metadata: { paymentId: payment.id },
    });
  }
  return "refunded";
}

/** Our Payment row for a Stripe charge (fulfil stores the payment intent id as providerTxId) */
export async function findPaymentForCharge(charge: Pick<Stripe.Charge, "payment_intent">) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return null;
  return db.payment.findFirst({
    where: { providerTxId: pi, provider: "STRIPE" },
    select: { id: true, status: true, userId: true, amount: true, planName: true },
  });
}

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
  );
  return "flagged";
}
