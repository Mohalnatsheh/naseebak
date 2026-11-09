/**
 * The one place that knows where Stripe (API 2025+, `stripe@20`) keeps the fields Pro reads. Newer invoices carry their
 * subscription under `parent.subscription_details`, and a subscription's period lives on its items, not at the top.
 * Tests and the local mock build plain objects of these shapes (lib/pro/mock.ts).
 */
import type Stripe from "stripe";
import { CHECKOUT_APP } from "@/lib/payments/fulfil";

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

export function invoiceMetadata(invoice: Stripe.Invoice): Record<string, string> | null {
  return invoice.parent?.subscription_details?.metadata ?? null;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription as Ref);
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
  let end: number | null = null;
  for (const item of sub.items?.data ?? []) {
    if (typeof item.current_period_end === "number" && (end === null || item.current_period_end > end)) end = item.current_period_end;
  }
  return toDate(end);
}

export function subscriptionEndedAt(sub: Stripe.Subscription): Date | null {
  return toDate(sub.ended_at);
}
