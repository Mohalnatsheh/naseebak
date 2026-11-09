import { describe, it, expect, vi, beforeEach } from "vitest";

// The real grant code and the real invoice handler over an in-memory database: a yearly membership over two paid years
const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import("./fake-db").createFakeDb> }));
vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  fake.current = createFakeDb(() => new Date("2026-11-09T10:00:00Z"));
  return { db: fake.current.db };
});
vi.mock("@/lib/notify", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: async () => ({ proPlans: { yearly: { enabled: true, price: 40, credits: 10 } } }) }));

import { handleProInvoicePaid } from "@/lib/pro/stripe-events";
import { runYearlyProGrants } from "@/lib/pro/grants";
import { fakeProInvoice } from "@/lib/pro/mock";

const META = { app: "naseebak", kind: "pro", userId: "u1", plan: "yearly", country: "JO", paymentId: "pay1" };
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const invoice = (id: string, start: string, end: string) =>
  fakeProInvoice({ id, subscriptionId: "sub_1", customerId: "cus_1", metadata: META, periodStart: sec(start), periodEnd: sec(end), amountPaid: 5640, currency: "usd", billingReason: id === "in_1" ? "subscription_create" : "subscription_cycle" });
const YEAR1 = invoice("in_1", "2026-11-09T10:00:00Z", "2027-11-09T10:00:00Z");
const YEAR2 = invoice("in_2", "2027-11-09T10:00:00Z", "2028-11-09T10:00:00Z");

const s = () => fake.current.store;
const sub = () => s().subs[0];

/** Runs the morning task on every day the next grant falls due, up to `until` */
async function dripUntil(until: string) {
  for (let i = 0; i < 40; i++) {
    const next = sub().nextCreditGrantAt as Date | null;
    if (!next || next > new Date(until)) return;
    if ((await runYearlyProGrants(next)).granted === 0) return;
  }
}

beforeEach(() => {
  const st = s();
  st.subs.length = 0;
  st.payments.length = 0;
  st.grants.length = 0;
  st.ledger.length = 0;
  st.users.length = 0;
  st.users.push({ id: "u1", matchCredits: 0 });
  st.payments.push({ id: "pay1", userId: "u1", type: "SUBSCRIPTION", planName: "pro_yearly", amount: 40, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null, createdAt: new Date("2026-11-09T09:59:00Z") });
});

describe("yearly Pro: the monthly drip is per paid year", () => {
  it("year 1: the invoice is month 1, the drip gives months 2..12 linked to that year's payment, then stops", async () => {
    await handleProInvoicePaid(YEAR1);
    expect(sub()).toMatchObject({ grantsMade: 1, nextCreditGrantAt: new Date("2026-12-09T10:00:00Z") });
    await dripUntil("2027-11-09T10:00:00Z");
    const keys = s().grants.map((g) => g.key);
    expect(keys).toEqual(["invoice:in_1", ...Array.from({ length: 11 }, (_, i) => `yearly:pay1:${i + 2}`)]);
    expect(s().grants.every((g) => g.paymentId === "pay1")).toBe(true);
    expect(sub().grantsMade).toBe(12);
    expect(s().users[0].matchCredits).toBe(120);
    // Nothing more in year 1, however often the task runs
    expect((await runYearlyProGrants(new Date("2027-11-01T06:00:00Z"))).granted).toBe(0);
  });

  it("year 2: the renewal restarts the count; months 2..12 of year 2 use the new payment; a re-delivered invoice resets nothing", async () => {
    await handleProInvoicePaid(YEAR1);
    await dripUntil("2027-11-09T10:00:00Z");

    await handleProInvoicePaid(YEAR2);
    const p2 = s().payments.find((p) => p.providerTxId === "in_2")!;
    expect(p2.id).not.toBe("pay1");
    expect(sub()).toMatchObject({ grantsMade: 1, nextCreditGrantAt: new Date("2027-12-09T10:00:00Z") });

    // One drip of year 2, then Stripe re-delivers the year-2 invoice
    await runYearlyProGrants(new Date("2027-12-09T10:00:00Z"));
    expect(sub()).toMatchObject({ grantsMade: 2, nextCreditGrantAt: new Date("2028-01-09T10:00:00Z") });
    expect(await handleProInvoicePaid(YEAR2)).toBe("already");
    expect(sub()).toMatchObject({ grantsMade: 2, nextCreditGrantAt: new Date("2028-01-09T10:00:00Z") });
    // And a late re-delivery of the year-1 invoice changes nothing either
    expect(await handleProInvoicePaid(YEAR1)).toBe("already");
    expect(sub()).toMatchObject({ grantsMade: 2, nextCreditGrantAt: new Date("2028-01-09T10:00:00Z") });

    await dripUntil("2028-11-09T10:00:00Z");
    const year2 = s().grants.filter((g) => g.paymentId === p2.id).map((g) => g.key);
    expect(year2).toEqual([`invoice:in_2`, ...Array.from({ length: 11 }, (_, i) => `yearly:${p2.id}:${i + 2}`)]);
    // Refund-linking: every grant belongs to its own year's payment
    expect(s().grants.filter((g) => g.paymentId === "pay1")).toHaveLength(12);
    expect(s().grants).toHaveLength(24);
    expect(sub().grantsMade).toBe(12);
    expect(s().users[0].matchCredits).toBe(240);
    expect(s().ledger.every((l) => l.reason === "PRO_GRANT")).toBe(true);
  });

  it("a renewal paid before year 1's drip finished: year 2 starts fresh, year 1's missing months are not owed twice", async () => {
    await handleProInvoicePaid(YEAR1);
    // Only months 2..5 dripped (the server was down, say)
    await dripUntil("2027-03-09T10:00:00Z");
    expect(sub().grantsMade).toBe(5);
    await handleProInvoicePaid(YEAR2);
    expect(sub()).toMatchObject({ grantsMade: 1, nextCreditGrantAt: new Date("2027-12-09T10:00:00Z") });
    await runYearlyProGrants(new Date("2027-12-09T10:00:00Z"));
    const p2 = s().payments.find((p) => p.providerTxId === "in_2")!;
    expect(s().grants.at(-1)).toMatchObject({ key: `yearly:${p2.id}:2`, paymentId: p2.id });
  });
});
