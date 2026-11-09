/**
 * Stripe-shaped fakes of the objects Pro's webhook handlers read (lib/pro/stripe-shapes.ts). The local mock
 * (`/api/dev/mock-checkout/[id]`) feeds them to the same handlers as the real webhook, and tests use them too.
 * Only the fields the handlers read are filled.
 */
import type Stripe from "stripe";

type Meta = Record<string, string>;

/** Ids of a mock subscription and its customer, derived from the checkout's Payment id and the member */
export const mockProSubscriptionId = (paymentId: string) => `mock_sub_${paymentId}`;
export const mockProCustomerId = (userId: string) => `mock_cus_${userId}`;

export function fakeProSession(a: { id: string; subscriptionId: string; customerId: string; metadata: Meta; created: number }): Stripe.Checkout.Session {
  return {
    id: a.id,
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    created: a.created,
    subscription: a.subscriptionId,
    customer: a.customerId,
    metadata: a.metadata,
  } as unknown as Stripe.Checkout.Session;
}

export function fakeProInvoice(a: {
  id: string;
  subscriptionId: string;
  customerId: string;
  metadata: Meta;
  periodStart: number;
  periodEnd: number;
  amountPaid: number;
  currency: string;
  billingReason: Stripe.Invoice.BillingReason;
}): Stripe.Invoice {
  return {
    id: a.id,
    object: "invoice",
    billing_reason: a.billingReason,
    customer: a.customerId,
    amount_paid: a.amountPaid,
    currency: a.currency,
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: { subscription: a.subscriptionId, metadata: a.metadata },
    },
    lines: { object: "list", has_more: false, data: [{ id: `il_${a.id}`, period: { start: a.periodStart, end: a.periodEnd } }] },
  } as unknown as Stripe.Invoice;
}

export function fakeProSubscription(a: {
  id: string;
  metadata: Meta;
  status: Stripe.Subscription.Status;
  periodEnd: number;
  cancelAtPeriodEnd?: boolean;
  endedAt?: number | null;
  customerId?: string;
}): Stripe.Subscription {
  return {
    id: a.id,
    object: "subscription",
    status: a.status,
    customer: a.customerId ?? "",
    cancel_at_period_end: a.cancelAtPeriodEnd ?? false,
    ended_at: a.endedAt ?? null,
    metadata: a.metadata,
    items: { object: "list", has_more: false, data: [{ id: `si_${a.id}`, current_period_end: a.periodEnd }] },
  } as unknown as Stripe.Subscription;
}
