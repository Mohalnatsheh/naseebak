/**
 * A second Pro subscription of a member who already has a live one (two checkouts paid, e.g. the website and the
 * app, or two tabs). The webhook (lib/pro/stripe-events) keeps it from ever being live or granting credits; this
 * settles it at Stripe: cancels it at once (real subscriptions only), refunds its invoice through the same steps as
 * the admin refund (Stripe refund with the same idempotency key, then `applyRefund`) and emails the admins.
 * Never throws: whatever fails is in the admins' email, to finish by hand.
 */
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { sendAdminAlert } from "@/lib/admin-alert";
import { applyRefund } from "@/lib/payments/refund";
import { cancelOnStripe } from "@/lib/pro/manage";
import { paymentIntentForInvoice } from "@/lib/pro/invoice-payments";

const isMock = (id: string) => id.startsWith("mock_");

/** Refunds the payment intent that paid this invoice; a retry returns the same refund (key shared with the admin route) */
async function refundInvoiceInStripe(paymentId: string, invoiceId: string): Promise<void> {
  const paymentIntent = await paymentIntentForInvoice(invoiceId);
  if (!paymentIntent) throw new Error(`no payment intent found for invoice ${invoiceId}`);
  try {
    await getStripe().refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `refund-${paymentId}` });
  } catch (err) {
    if ((err as { code?: string })?.code !== "charge_already_refunded") throw err;
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function settleDuplicateProSubscription(a: {
  userId: string;
  stripeSubscriptionId: string;
  keptStripeSubscriptionId: string | null;
  paymentId: string;
  invoiceId: string;
  amountPaid: number;
  /** The first time this invoice is seen: the admins hear about it even when nothing had to be refunded */
  firstSeen: boolean;
}): Promise<void> {
  const problems: string[] = [];
  const mock = isMock(a.stripeSubscriptionId) || isMock(a.invoiceId);

  if (!mock) {
    try {
      await cancelOnStripe(a.stripeSubscriptionId);
    } catch (e) {
      problems.push(`Cancelling subscription ${a.stripeSubscriptionId} in Stripe failed (${errText(e)}): cancel it in the Stripe dashboard.`);
    }
  }

  let refunded = false;
  try {
    const payment = await db.payment.findUnique({ where: { id: a.paymentId }, select: { status: true } });
    if (payment?.status === "COMPLETED" && a.amountPaid > 0) {
      if (!mock) await refundInvoiceInStripe(a.paymentId, a.invoiceId);
      refunded = (await applyRefund({ paymentId: a.paymentId, note: "Duplicate Pro subscription" })) === "refunded";
    }
  } catch (e) {
    problems.push(`Refunding payment ${a.paymentId} (invoice ${a.invoiceId}) failed (${errText(e)}): refund it in Admin → Payments.`);
  }

  console.warn("[pro] duplicate subscription settled:", a.stripeSubscriptionId, refunded ? "refunded" : "not refunded", problems.length ? "with problems" : "");
  if (!refunded && problems.length === 0 && !a.firstSeen) return;

  await sendAdminAlert(
    problems.length ? "Duplicate Pro subscription: action needed" : "Duplicate Pro subscription cancelled and refunded",
    [
      `Member ${a.userId} paid a second Pro subscription (${a.stripeSubscriptionId}) while ${a.keptStripeSubscriptionId ?? "another one"} was live.`,
      `The second one was never made live and granted no credits${mock ? " (local mock: nothing sent to Stripe)" : ""}.`,
      refunded ? `Its payment ${a.paymentId} (invoice ${a.invoiceId}) was refunded.` : `Payment ${a.paymentId} (invoice ${a.invoiceId}) was not refunded now.`,
      ...problems,
    ].join("\n"),
    { userId: a.userId },
  );
}
