/**
 * The one place that knows where Stripe keeps the fields Pro reads, in both payload shapes.
 * Webhook payloads are rendered in the endpoint's API version, not the SDK's, and the account is shared with other
 * sites, so that version is unknown here. Both are read:
 * - API 2025-03-31 ("basil") and later: an invoice carries its subscription under `parent.subscription_details`, a
 *   subscription's period lives on its items, and a charge no longer names its invoice.
 * - Before: `invoice.subscription` / `invoice.subscription_details.metadata`, `subscription.current_period_end`, and
 *   `charge.invoice`.
 * API calls made by the SDK (stripe@20) always get the new shape. Tests and the local mock build plain objects of
 * these shapes (lib/pro/mock.ts, src/__tests__/pro/legacy-shapes.ts).
 */
import type Stripe from "stripe";
import { CHECKOUT_APP } from "@/lib/payments/packages";

type Ref = string | { id: string } | null | undefined;

/** The id of a field Stripe returns either as an id or, when expanded, as an object */
export function idOf(ref: Ref): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id ?? null;
}

/** A Naseebak Pro object: our marker and kind «pro». Everything else on the shared account is someone else's */
export function isOurProMetadata(m: Record<string, string> | null | undefined): boolean {
  return !!m && m.app === CHECKOUT_APP && m.kind === "pro";
}

const toDate = (seconds: number | null | undefined): Date | null =>
  typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;

/** The fields older API versions put on an invoice, a subscription or a charge (gone from the SDK's types) */
type LegacyInvoice = { subscription?: Ref; subscription_details?: { metadata?: Record<string, string> | null } | null };
type LegacySubscription = { current_period_end?: number | null };
type LegacyCharge = { invoice?: Ref };

export function invoiceMetadata(invoice: Stripe.Invoice): Record<string, string> | null {
  const legacy = invoice as unknown as LegacyInvoice;
  return invoice.parent?.subscription_details?.metadata ?? legacy.subscription_details?.metadata ?? null;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as unknown as LegacyInvoice;
  return idOf(invoice.parent?.subscription_details?.subscription as Ref) ?? idOf(legacy.subscription);
}

/** The invoice an older-API charge payload names, or null (newer payloads: lib/pro/invoice-payments) */
export function chargeInvoiceId(charge: Pick<Stripe.Charge, "payment_intent">): string | null {
  return idOf((charge as unknown as LegacyCharge).invoice);
}

/** The paid period of a subscription invoice: from its lines (the subscription line covers the whole period) */
export function invoicePeriod(invoice: Stripe.Invoice): { start: Date; end: Date } | null {
  const lines = invoice.lines?.data ?? [];
  let start: number | null = null;
  let end: number | null = null;
  for (const line of lines) {
    if (!line.period) continue;
    if (end === null || line.period.end > end) {
      end = line.period.end;
      start = line.period.start;
    }
  }
  const s = toDate(start);
  const e = toDate(end);
  return s && e ? { start: s, end: e } : null;
}

export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const top = (sub as unknown as LegacySubscription).current_period_end;
  let end: number | null = typeof top === "number" ? top : null;
  for (const item of sub.items?.data ?? []) {
    if (typeof item.current_period_end === "number" && (end === null || item.current_period_end > end)) end = item.current_period_end;
  }
  return toDate(end);
}

export function subscriptionEndedAt(sub: Stripe.Subscription): Date | null {
  return toDate(sub.ended_at);
}
