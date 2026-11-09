import { describe, it, expect } from "vitest";
import {
  chargeInvoiceId,
  invoiceMetadata,
  invoicePeriod,
  invoiceSubscriptionId,
  subscriptionPeriodEnd,
} from "@/lib/pro/stripe-shapes";
import { fakeProInvoice, fakeProSubscription } from "@/lib/pro/mock";
import { legacyInvoice, legacySubscription } from "./legacy-shapes";

const META = { app: "naseebak", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId: "pay1" };
const T0 = 1_800_000_000;
const T1 = T0 + 30 * 86400;

const invoice = () =>
  fakeProInvoice({ id: "in_1", subscriptionId: "sub_1", customerId: "cus_1", metadata: META, periodStart: T0, periodEnd: T1, amountPaid: 564, currency: "usd", billingReason: "subscription_create" });
const sub = () => fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T1 });

describe("Stripe payload shapes: the webhook endpoint's API version is unknown, both are read", () => {
  it("invoice, API 2025-03-31 and later (parent.subscription_details)", () => {
    expect(invoiceMetadata(invoice())).toEqual(META);
    expect(invoiceSubscriptionId(invoice())).toBe("sub_1");
    expect(invoicePeriod(invoice())).toEqual({ start: new Date(T0 * 1000), end: new Date(T1 * 1000) });
  });

  it("invoice, before 2025-03-31 (invoice.subscription, invoice.subscription_details)", () => {
    const old = legacyInvoice(invoice());
    expect((old as unknown as { parent?: unknown }).parent).toBeUndefined();
    expect(invoiceMetadata(old)).toEqual(META);
    expect(invoiceSubscriptionId(old)).toBe("sub_1");
    expect(invoicePeriod(old)).toEqual({ start: new Date(T0 * 1000), end: new Date(T1 * 1000) });
  });

  it("invoice, old shape with an expanded subscription object", () => {
    const old = legacyInvoice(invoice(), { expand: true });
    expect(invoiceSubscriptionId(old)).toBe("sub_1");
  });

  it("a one-off invoice of another site: no metadata, no subscription in either shape", () => {
    const other = { id: "in_x", parent: null, subscription: null, subscription_details: null } as never;
    expect(invoiceMetadata(other)).toBeNull();
    expect(invoiceSubscriptionId(other)).toBeNull();
  });

  it("subscription period end: items (new) or top-level current_period_end (old)", () => {
    expect(subscriptionPeriodEnd(sub())).toEqual(new Date(T1 * 1000));
    const old = legacySubscription(sub());
    expect(subscriptionPeriodEnd(old)).toEqual(new Date(T1 * 1000));
    // Both present (a transition payload): the later one
    const both = { ...sub(), current_period_end: T1 + 100 } as never;
    expect(subscriptionPeriodEnd(both)).toEqual(new Date((T1 + 100) * 1000));
  });

  it("charge → invoice: only older payloads carry it (string or expanded)", () => {
    expect(chargeInvoiceId({ invoice: "in_1" } as never)).toBe("in_1");
    expect(chargeInvoiceId({ invoice: { id: "in_1" } } as never)).toBe("in_1");
    expect(chargeInvoiceId({ payment_intent: "pi_1" } as never)).toBeNull();
  });
});
