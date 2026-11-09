/**
 * Between a Pro invoice and its payment intent. A Pro Payment stores the invoice id (`providerTxId`), while charges,
 * refunds and disputes speak of payment intents. Since Stripe API 2025 neither a charge nor a payment intent names its
 * invoice: the link is the invoice's InvoicePayment.
 */
import { getStripe } from "@/lib/stripe";
import { idOf } from "@/lib/pro/stripe-shapes";

/** The invoice a payment intent paid, or null (not an invoice payment: a credit package, or another site's charge) */
export async function invoiceIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const list = await getStripe().invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 1,
  });
  return idOf(list.data[0]?.invoice ?? null);
}

/** The payment intent that paid an invoice, or null */
export async function paymentIntentForInvoice(invoiceId: string): Promise<string | null> {
  const list = await getStripe().invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 1 });
  return idOf(list.data[0]?.payment?.payment_intent ?? null);
}
