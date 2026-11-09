import { describe, it, expect, vi, beforeEach } from "vitest";

// A small in-memory database: these handlers are about ordering and repeats, which call assertions hide
type Row = Record<string, unknown> & { id: string };
const store = vi.hoisted(() => ({ subs: [] as Row[], payments: [] as Row[], users: [] as Row[], seq: 0 }));

const copy = (r: Row | undefined) => (r ? { ...r } : null);

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date) && "in" in (v as object)) return ((v as { in: unknown[] }).in).includes(row[k]);
    if (v && typeof v === "object" && !(v instanceof Date) && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
    return row[k] === v;
  });
}

/** Rows come back as copies, like Prisma's; `defaults` are the schema defaults */
function table(rows: () => Row[], prefix: string, defaults: Record<string, unknown> = {}) {
  return {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => copy(rows().find((r) => matches(r, where)))),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => copy(rows().find((r) => matches(r, where)))),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows().filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${prefix}${++store.seq}`, ...defaults, ...data } as Row;
      rows().push(row);
      return copy(row);
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = rows().find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return copy(row);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows().filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
  };
}

const db = vi.hoisted(() => ({}) as Record<string, unknown>);
const grants = vi.hoisted(() => ({ keys: new Set<string>(), grantProCredits: vi.fn() }));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn() }));
const settings = vi.hoisted(() => ({ getCountrySettings: vi.fn() }));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/countries/settings", () => settings);
vi.mock("@/lib/pro/grants", () => ({ grantProCredits: grants.grantProCredits }));
const stripeMock = vi.hoisted(() => ({ subscriptions: { cancel: vi.fn(async () => ({ status: "canceled" })), retrieve: vi.fn() }, refunds: { create: vi.fn() } }));
const alertMock = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripeMock }));
vi.mock("@/lib/admin-alert", () => alertMock);

import {
  handleProCheckoutCompleted,
  handleProInvoiceFailed,
  handleProInvoicePaid,
  handleProSubscriptionChanged,
  isOurProMetadata,
} from "@/lib/pro/stripe-events";
import { fakeProInvoice, fakeProSession, fakeProSubscription } from "@/lib/pro/mock";
import { legacyInvoice, legacySubscription } from "./legacy-shapes";

const META = { app: "naseebak", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId: "pay1" };
const T0 = Math.floor(new Date("2026-11-09T10:00:00Z").getTime() / 1000);
const T1 = Math.floor(new Date("2026-12-09T10:00:00Z").getTime() / 1000);
const T2 = Math.floor(new Date("2027-01-09T10:00:00Z").getTime() / 1000);

const firstInvoice = (over: Partial<Parameters<typeof fakeProInvoice>[0]> = {}) =>
  fakeProInvoice({ id: "in_1", subscriptionId: "sub_1", customerId: "cus_1", metadata: META, periodStart: T0, periodEnd: T1, amountPaid: 564, currency: "usd", billingReason: "subscription_create", ...over });
const session = () => fakeProSession({ id: "cs_1", subscriptionId: "sub_1", customerId: "cus_1", metadata: META, created: T0 });

function pendingCheckoutRow() {
  store.payments.push({ id: "pay1", userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE", status: "PENDING", providerTxId: null, proSubscriptionId: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.subs = [];
  store.payments = [];
  store.users = [{ id: "u1" }];
  store.seq = 0;
  grants.keys = new Set();
  Object.assign(db, {
    proSubscription: table(() => store.subs, "ps", { grantsMade: 0, cancelAtPeriodEnd: false, nextCreditGrantAt: null, endedAt: null }),
    payment: table(() => store.payments, "pm"),
    user: table(() => store.users, "u"),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  });
  grants.grantProCredits.mockImplementation(async (a: { key: string; subscriptionId: string; advanceNextTo?: Date }) => {
    if (grants.keys.has(a.key)) return "already";
    grants.keys.add(a.key);
    const sub = store.subs.find((s) => s.id === a.subscriptionId)!;
    sub.grantsMade = (sub.grantsMade as number) + 1;
    if (a.advanceNextTo) sub.nextCreditGrantAt = a.advanceNextTo;
    return "granted";
  });
  settings.getCountrySettings.mockResolvedValue({ proPlans: { monthly: { enabled: true, price: 4, credits: 8 }, yearly: { enabled: true, price: 40, credits: 10 } } });
  notifyMock.notify.mockResolvedValue(undefined);
});

describe("isOurProMetadata", () => {
  it("needs both the Naseebak marker and kind pro", () => {
    expect(isOurProMetadata(META)).toBe(true);
    expect(isOurProMetadata({ app: "naseebak" })).toBe(false);
    expect(isOurProMetadata({ app: "other", kind: "pro" })).toBe(false);
    expect(isOurProMetadata(null)).toBe(false);
    expect(isOurProMetadata(undefined)).toBe(false);
  });
});

describe("another site's objects on the shared Stripe account", () => {
  it("are 'not_ours' with zero db calls", async () => {
    const other = { app: "other", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId: "pay1" };
    expect(await handleProCheckoutCompleted(fakeProSession({ id: "cs_x", subscriptionId: "sub_x", customerId: "c", metadata: other, created: T0 }))).toBe("not_ours");
    expect(await handleProInvoicePaid(firstInvoice({ metadata: other }))).toBe("not_ours");
    expect(await handleProInvoiceFailed(firstInvoice({ metadata: other }))).toBe("not_ours");
    expect(await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_x", metadata: other, status: "active", periodEnd: T1 }), "deleted")).toBe("not_ours");
    // An invoice with no subscription parent at all (a one-off invoice of another site)
    expect(await handleProInvoicePaid({ id: "in_z", parent: null } as never)).toBe("not_ours");
    expect(db.$transaction).not.toHaveBeenCalled();
    for (const t of ["proSubscription", "payment", "user"]) {
      for (const fn of Object.values(db[t] as Record<string, { mock: { calls: unknown[] } }>)) expect(fn.mock.calls).toHaveLength(0);
    }
    expect(grants.grantProCredits).not.toHaveBeenCalled();
  });
});

describe("handleProInvoicePaid", () => {
  it("first invoice: completes the checkout's PENDING payment, sets the period, grants once, notices once", async () => {
    pendingCheckoutRow();
    expect(await handleProInvoicePaid(firstInvoice())).toBe("ok");
    expect(store.subs).toHaveLength(1);
    const sub = store.subs[0];
    expect(sub).toMatchObject({ userId: "u1", country: "JO", plan: "MONTHLY", status: "ACTIVE", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", creditsPerGrant: 8, price: 4, currency: "JOD" });
    expect(sub.currentPeriodEnd).toEqual(new Date(T1 * 1000));
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ id: "pay1", status: "COMPLETED", providerTxId: "in_1", proSubscriptionId: sub.id });
    expect(grants.grantProCredits).toHaveBeenCalledWith({ subscriptionId: sub.id, paymentId: "pay1", key: "invoice:in_1", credits: 8 });
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT", title: "أصبحت عضوية Pro فعّالة", sms: false }));
    // The per-subscription lock was taken
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it("the same invoice twice: one grant, one COMPLETED payment, one notice", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    expect(await handleProInvoicePaid(firstInvoice())).toBe("already");
    expect(store.subs).toHaveLength(1);
    expect(store.payments.filter((p) => p.status === "COMPLETED")).toHaveLength(1);
    expect(grants.keys.size).toBe(1);
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
  });

  it("invoice before checkout: creates the row and grants once; checkout-completed then changes nothing", async () => {
    pendingCheckoutRow();
    expect(await handleProInvoicePaid(firstInvoice())).toBe("ok");
    const before = JSON.stringify(store);
    expect(await handleProCheckoutCompleted(session())).toBe("already");
    expect(JSON.stringify(store)).toBe(before);
    expect(grants.grantProCredits).toHaveBeenCalledTimes(1);
    expect(store.subs).toHaveLength(1);
  });

  it("checkout then invoice: one row, filled in by the invoice", async () => {
    pendingCheckoutRow();
    expect(await handleProCheckoutCompleted(session())).toBe("ok");
    expect(store.subs).toHaveLength(1);
    expect(await handleProInvoicePaid(firstInvoice())).toBe("ok");
    expect(store.subs).toHaveLength(1);
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T1 * 1000));
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ status: "COMPLETED", providerTxId: "in_1" });
    expect(grants.keys).toEqual(new Set(["invoice:in_1"]));
  });

  it("the checkout's Payment row is missing: creates it COMPLETED under the metadata id, and only once", async () => {
    await handleProInvoicePaid(firstInvoice());
    await handleProInvoicePaid(firstInvoice());
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ id: "pay1", userId: "u1", status: "COMPLETED", providerTxId: "in_1", planName: "pro_monthly", type: "SUBSCRIPTION", provider: "STRIPE" });
    // Price from the country's plan config when there's no Payment to read it from
    expect(store.subs[0]).toMatchObject({ price: 4, currency: "JOD", creditsPerGrant: 8 });
    expect(grants.keys.size).toBe(1);
  });

  it("a renewal invoice creates a second COMPLETED Payment and grant, moves the period, no second 'started' notice", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    const renewal = firstInvoice({ id: "in_2", periodStart: T1, periodEnd: T2, billingReason: "subscription_cycle" });
    expect(await handleProInvoicePaid(renewal)).toBe("ok");
    expect(store.payments).toHaveLength(2);
    const second = store.payments.find((p) => p.providerTxId === "in_2")!;
    expect(second).toMatchObject({ status: "COMPLETED", proSubscriptionId: store.subs[0].id, planName: "pro_monthly", amount: 4, currency: "JOD", userId: "u1" });
    expect(second.id).not.toBe("pay1");
    expect(grants.keys).toEqual(new Set(["invoice:in_1", "invoice:in_2"]));
    expect(grants.grantProCredits).toHaveBeenLastCalledWith(expect.objectContaining({ paymentId: second.id, key: "invoice:in_2" }));
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T2 * 1000));
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
  });

  it("an older invoice delivered late never moves the period back", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    await handleProInvoicePaid(firstInvoice({ id: "in_2", periodStart: T1, periodEnd: T2, billingReason: "subscription_cycle" }));
    await handleProInvoicePaid(firstInvoice());
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T2 * 1000));
  });

  it("brings a PAST_DUE subscription back to ACTIVE, never an ENDED one", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    store.subs[0].status = "PAST_DUE";
    await handleProInvoicePaid(firstInvoice({ id: "in_2", periodStart: T1, periodEnd: T2 }));
    expect(store.subs[0].status).toBe("ACTIVE");
    store.subs[0].status = "ENDED";
    await handleProInvoicePaid(firstInvoice({ id: "in_3", periodStart: T2, periodEnd: T2 + 1000 }));
    expect(store.subs[0].status).toBe("ENDED");
    // Not revived, cancelled at Stripe, admins asked to decide on a refund by hand; never refunded automatically
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1", expect.anything());
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(alertMock.sendAdminAlert).toHaveBeenCalledWith("Pro renewal paid after Pro ended: refund decision needed", expect.any(String), { userId: "u1" });
  });

  it("yearly: the first invoice grants month 1 and sets the next grant one month on", async () => {
    pendingCheckoutRow();
    store.payments[0].planName = "pro_yearly";
    store.payments[0].amount = 40;
    const yearly = { ...META, plan: "yearly" };
    const end = Math.floor(new Date("2027-11-09T10:00:00Z").getTime() / 1000);
    await handleProInvoicePaid(firstInvoice({ metadata: yearly, periodEnd: end }));
    expect(store.subs[0]).toMatchObject({ plan: "YEARLY", creditsPerGrant: 10, grantsMade: 1 });
    expect(grants.grantProCredits).toHaveBeenCalledWith(expect.objectContaining({ key: "invoice:in_1", credits: 10, restartYear: true, advanceNextTo: new Date("2026-12-09T10:00:00Z") }));
    expect(store.subs[0].nextCreditGrantAt).toEqual(new Date("2026-12-09T10:00:00Z"));
  });

  it("a deleted member's subscription is still recorded, with no member", async () => {
    store.users = [];
    await handleProInvoicePaid(firstInvoice());
    expect(store.subs[0].userId).toBeNull();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });
});

describe("handleProCheckoutCompleted", () => {
  it("creates the row from metadata with the Payment's price and the plan's credits at this moment", async () => {
    pendingCheckoutRow();
    expect(await handleProCheckoutCompleted(session())).toBe("ok");
    expect(store.subs[0]).toMatchObject({ userId: "u1", plan: "MONTHLY", country: "JO", price: 4, currency: "JOD", creditsPerGrant: 8, stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", status: "ACTIVE" });
    // Paid at checkout: live for one estimated period until the invoice gives the exact end
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date("2026-12-09T10:00:00Z"));
    expect(grants.grantProCredits).not.toHaveBeenCalled();
    // The same event again
    expect(await handleProCheckoutCompleted(session())).toBe("already");
    expect(store.subs).toHaveLength(1);
  });

  it("a session not paid yet creates a row that isn't live", async () => {
    pendingCheckoutRow();
    const s = { ...session(), payment_status: "unpaid" } as never;
    await handleProCheckoutCompleted(s);
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T0 * 1000));
  });
});

describe("handleProInvoiceFailed", () => {
  it("marks PAST_DUE and asks the member to update the card, once per Amman day", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    notifyMock.notify.mockClear();
    expect(await handleProInvoiceFailed(firstInvoice({ id: "in_2", billingReason: "subscription_cycle" }))).toBe("ok");
    expect(store.subs[0].status).toBe("PAST_DUE");
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        type: "PAYMENT",
        title: "تعذّر تجديد اشتراك Pro",
        body: "يمكنك تحديث بطاقتك من صفحة الدفع لمواصلة Pro.",
        sms: false,
        oncePerDay: "pro-payment-failed",
      })
    );
    expect(grants.grantProCredits).toHaveBeenCalledTimes(1);
  });

  it("no subscription row yet: nothing to mark", async () => {
    expect(await handleProInvoiceFailed(firstInvoice())).toBe("already");
    expect(store.subs).toHaveLength(0);
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });
});

describe("handleProSubscriptionChanged", () => {
  async function live() {
    pendingCheckoutRow();
    await handleProInvoicePaid(firstInvoice());
    notifyMock.notify.mockClear();
  }

  it("syncs cancelAtPeriodEnd and the period end", async () => {
    await live();
    expect(await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T1, cancelAtPeriodEnd: true }))).toBe("ok");
    expect(store.subs[0]).toMatchObject({ cancelAtPeriodEnd: true, status: "ACTIVE" });
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T2, cancelAtPeriodEnd: false }));
    expect(store.subs[0]).toMatchObject({ cancelAtPeriodEnd: false });
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T2 * 1000));
  });

  it("Stripe 'canceled' on an update → CANCELED with endedAt, one ended notice even when deleted follows", async () => {
    await live();
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "canceled", periodEnd: T1, endedAt: T0 + 50 }));
    expect(store.subs[0].status).toBe("CANCELED");
    expect(store.subs[0].endedAt).toEqual(new Date((T0 + 50) * 1000));
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "انتهت عضوية Pro" }));
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "canceled", periodEnd: T1, endedAt: T0 + 50 }), "deleted");
    expect(store.subs[0].status).toBe("ENDED");
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
  });

  it.each(["unpaid", "paused"] as const)("Stripe '%s' (it stopped collecting, no deletion follows) → not live, endedAt, ended notice", async (status) => {
    await live();
    expect(await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status, periodEnd: T2 }))).toBe("ok");
    expect(store.subs[0].status).toBe("CANCELED");
    expect(store.subs[0].endedAt).toBeInstanceOf(Date);
    // Stripe keeps an unpaid/paused subscription: it is cancelled there too, so a late payment can't restart billing
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false });
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "انتهت عضوية Pro", sms: false }));
    // Never live again from a later update, and no repeated notice
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T2 }));
    expect(store.subs[0].status).toBe("CANCELED");
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
  });

  it("past_due stays live (Stripe is still retrying)", async () => {
    await live();
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "past_due", periodEnd: T2 }));
    expect(store.subs[0].status).toBe("PAST_DUE");
    expect(store.subs[0].endedAt).toBeNull();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("incomplete_expired (the first payment never went through): not live, endedAt, no ended notice", async () => {
    pendingCheckoutRow();
    await handleProCheckoutCompleted({ ...session(), payment_status: "unpaid" } as never);
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "incomplete_expired", periodEnd: T1 }));
    expect(store.subs[0].status).toBe("CANCELED");
    expect(store.subs[0].endedAt).toBeInstanceOf(Date);
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("customer.subscription.deleted → ENDED with endedAt and one notice", async () => {
    await live();
    const deleted = fakeProSubscription({ id: "sub_1", metadata: META, status: "canceled", periodEnd: T1, endedAt: T0 + 100 });
    expect(await handleProSubscriptionChanged(deleted, "deleted")).toBe("ok");
    expect(store.subs[0].status).toBe("ENDED");
    expect(store.subs[0].endedAt).toEqual(new Date((T0 + 100) * 1000));
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT", title: "انتهت عضوية Pro", sms: false }));
    // Re-delivered
    expect(await handleProSubscriptionChanged(deleted, "deleted")).toBe("already");
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
  });

  it("an update never brings an ENDED row back", async () => {
    await live();
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "canceled", periodEnd: T1 }), "deleted");
    await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T2 }));
    expect(store.subs[0].status).toBe("ENDED");
  });

  it("an unknown subscription is left alone", async () => {
    expect(await handleProSubscriptionChanged(fakeProSubscription({ id: "sub_9", metadata: META, status: "active", periodEnd: T1 }))).toBe("already");
    expect(store.subs).toHaveLength(0);
  });
});

describe("an endpoint on a Stripe API version before 2025-03-31 (older payload shapes)", () => {
  const oldFirst = (over: Partial<Parameters<typeof fakeProInvoice>[0]> = {}) => legacyInvoice(firstInvoice(over));

  it("invoice.paid: completes the checkout payment, sets the period and grants, as with the new shape", async () => {
    pendingCheckoutRow();
    expect(await handleProInvoicePaid(oldFirst())).toBe("ok");
    expect(store.subs).toHaveLength(1);
    expect(store.subs[0]).toMatchObject({ userId: "u1", stripeSubscriptionId: "sub_1", status: "ACTIVE", creditsPerGrant: 8 });
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T1 * 1000));
    expect(store.payments[0]).toMatchObject({ id: "pay1", status: "COMPLETED", providerTxId: "in_1" });
    expect(grants.keys).toEqual(new Set(["invoice:in_1"]));
    // A renewal in the old shape moves the period too
    expect(await handleProInvoicePaid(oldFirst({ id: "in_2", periodStart: T1, periodEnd: T2, billingReason: "subscription_cycle" }))).toBe("ok");
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T2 * 1000));
  });

  it("invoice.paid of another site in the old shape is still 'not_ours'", async () => {
    const other = { ...META, app: "other" };
    expect(await handleProInvoicePaid(oldFirst({ metadata: other }))).toBe("not_ours");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed: PAST_DUE", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(oldFirst());
    expect(await handleProInvoiceFailed(oldFirst({ id: "in_2", billingReason: "subscription_cycle" }))).toBe("ok");
    expect(store.subs[0].status).toBe("PAST_DUE");
  });

  it("customer.subscription.updated: the period end comes from the top-level current_period_end", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(oldFirst());
    const updated = legacySubscription(fakeProSubscription({ id: "sub_1", metadata: META, status: "active", periodEnd: T2, cancelAtPeriodEnd: true }));
    expect(await handleProSubscriptionChanged(updated)).toBe("ok");
    expect(store.subs[0]).toMatchObject({ cancelAtPeriodEnd: true, status: "ACTIVE" });
    expect(store.subs[0].currentPeriodEnd).toEqual(new Date(T2 * 1000));
  });

  it("customer.subscription.deleted: ENDED", async () => {
    pendingCheckoutRow();
    await handleProInvoicePaid(oldFirst());
    const deleted = legacySubscription(fakeProSubscription({ id: "sub_1", metadata: META, status: "canceled", periodEnd: T1, endedAt: T0 + 100 }));
    expect(await handleProSubscriptionChanged(deleted, "deleted")).toBe("ok");
    expect(store.subs[0].status).toBe("ENDED");
  });
});
