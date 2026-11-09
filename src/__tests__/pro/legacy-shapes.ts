/**
 * Stripe payloads as an endpoint on an API version before 2025-03-31 renders them: the invoice names its subscription
 * at the top (`subscription`, `subscription_details`) with no `parent`, and the subscription keeps its period at the
 * top (`current_period_end`), not on its items.
 */
import type Stripe from "stripe";

export function legacyInvoice(inv: Stripe.Invoice, o: { expand?: boolean } = {}): Stripe.Invoice {
  const details = inv.parent?.subscription_details;
  const subId = typeof details?.subscription === "string" ? details.subscription : details?.subscription?.id;
  const rest: Record<string, unknown> = { ...inv };
  delete rest.parent;
  return {
    ...rest,
    subscription: o.expand ? { id: subId, object: "subscription" } : subId,
    subscription_details: { metadata: details?.metadata ?? null },
  } as unknown as Stripe.Invoice;
}

export function legacySubscription(sub: Stripe.Subscription): Stripe.Subscription {
  const end = sub.items.data[0]?.current_period_end;
  return {
    ...sub,
    current_period_end: end,
    items: { ...sub.items, data: sub.items.data.map(({ id }) => ({ id })) },
  } as unknown as Stripe.Subscription;
}
