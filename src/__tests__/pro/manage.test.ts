import { describe, it, expect, vi, beforeEach } from "vitest";

// The real cancel / refund code over an in-memory database; Stripe, notices and admin alerts are fakes
const fake = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import("./fake-db").createFakeDb> }));
vi.mock("@/lib/db", async () => {
  const { createFakeDb } = await import("./fake-db");
  fake.current = createFakeDb();
  return { db: fake.current.db };
});
const stripe = vi.hoisted(() => ({
  subscriptions: { update: vi.fn(), cancel: vi.fn(), retrieve: vi.fn() },
}));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe }));
vi.mock("@/lib/notify", () => notifyMock);
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/countries/settings", () => ({ getCountrySettings: async () => ({}) }));

import { cancelPro, resumePro, cancelProNow, cancelProForDeletion, stopProRenewalOnLeave } from "@/lib/pro/manage";
import { applyRefund } from "@/lib/payments/refund";
import { isPro } from "@/lib/pro/status";

const s = () => fake.current.store;
const DAY = 24 * 3600 * 1000;
const future = () => new Date(Date.now() + 20 * DAY);

function addSub(over: Record<string, unknown> = {}) {
  const row = {
    id: "ps1", userId: "u1", country: "JO", plan: "MONTHLY", status: "ACTIVE", stripeSubscriptionId: "sub_1",
    stripeCustomerId: "cus_1", currentPeriodEnd: future(), cancelAtPeriodEnd: false, price: 4, currency: "JOD",
    creditsPerGrant: 8, grantsMade: 1, nextCreditGrantAt: null, endedAt: null, createdAt: new Date(Date.now() - 400 * DAY), ...over,
  };
  s().subs.push(row);
  return row;
}

function addPayment(id: string, createdAt: Date, over: Record<string, unknown> = {}) {
  s().payments.push({
    id, userId: "u1", type: "SUBSCRIPTION", planName: "pro_monthly", amount: 4, currency: "JOD", provider: "STRIPE",
    status: "COMPLETED", providerTxId: `in_${id}`, proSubscriptionId: "ps1", createdAt, ...over,
  });
}

function addGrant(id: string, paymentId: string, credits: number) {
  s().grants.push({ id, key: `k:${id}`, subscriptionId: "ps1", paymentId, userId: "u1", credits, takenBack: false, createdAt: new Date() });
}

beforeEach(() => {
  vi.clearAllMocks();
  const st = s();
  st.subs.length = 0;
  st.payments.length = 0;
  st.grants.length = 0;
  st.ledger.length = 0;
  st.users.length = 0;
  st.users.push({ id: "u1", matchCredits: 10 });
  stripe.subscriptions.update.mockResolvedValue({});
  stripe.subscriptions.cancel.mockResolvedValue({ status: "canceled" });
  stripe.subscriptions.retrieve.mockResolvedValue({ status: "active" });
  notifyMock.notify.mockResolvedValue(undefined);
  alert.sendAdminAlert.mockResolvedValue(undefined);
});

describe("cancelPro / resumePro", () => {
  it("cancel asks Stripe to stop at the period end, mirrors it and keeps Pro until then", async () => {
    addSub();
    expect(await cancelPro("u1")).toBe("ok");
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(s().subs[0].cancelAtPeriodEnd).toBe(true);
    expect(s().subs[0].status).toBe("ACTIVE");
    expect(await isPro("u1")).toBe(true);
  });

  it("resume undoes it", async () => {
    addSub({ cancelAtPeriodEnd: true });
    expect(await resumePro("u1")).toBe("ok");
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
    expect(s().subs[0].cancelAtPeriodEnd).toBe(false);
    expect(await isPro("u1")).toBe(true);
  });

  it("a mock subscription only changes locally", async () => {
    addSub({ stripeSubscriptionId: "mock_sub_pay1" });
    expect(await cancelPro("u1")).toBe("ok");
    expect(s().subs[0].cancelAtPeriodEnd).toBe(true);
    expect(await resumePro("u1")).toBe("ok");
    expect(s().subs[0].cancelAtPeriodEnd).toBe(false);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("no live membership: nothing to cancel or resume", async () => {
    addSub({ status: "ENDED" });
    expect(await cancelPro("u1")).toBe("none");
    expect(await resumePro("u1")).toBe("none");
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("a Stripe failure leaves the local row as it was", async () => {
    addSub();
    stripe.subscriptions.update.mockRejectedValueOnce(new Error("stripe down"));
    await expect(cancelPro("u1")).rejects.toThrow("stripe down");
    expect(s().subs[0].cancelAtPeriodEnd).toBe(false);
  });
});

describe("stopProRenewalOnLeave (IOS-H01 ruling)", () => {
  it("pausing stops the renewal at the period end, no refund, and tells the member with the end date", async () => {
    addSub();
    expect(await stopProRenewalOnLeave("u1", "paused")).toBe("stopped");
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(s().subs[0]).toMatchObject({ cancelAtPeriodEnd: true, status: "ACTIVE" });
    expect(await isPro("u1")).toBe(true);
    const n = notifyMock.notify.mock.calls[0][0];
    expect(n).toMatchObject({ userId: "u1", title: "توقّف تجديد Pro", url: "/dashboard/pro", sms: false });
    expect(n.body).toContain("أوقفت حسابك مؤقتاً");
    expect(n.body).toMatch(/حتى \d+ /);
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("a deletion request says so; nothing to do without Pro or when renewal already stopped", async () => {
    expect(await stopProRenewalOnLeave("u1", "deletion")).toBe("none");
    addSub({ cancelAtPeriodEnd: true });
    expect(await stopProRenewalOnLeave("u1", "deletion")).toBe("already");
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("a Stripe failure never blocks the pause: the admins are told to stop it by hand", async () => {
    addSub();
    stripe.subscriptions.update.mockRejectedValue(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await stopProRenewalOnLeave("u1", "paused")).toBe("failed");
    expect(s().subs[0].cancelAtPeriodEnd).toBe(false);
    expect(alert.sendAdminAlert).toHaveBeenCalledWith("Pro renewal not stopped for a member who left", expect.any(String), { userId: "u1" });
  });

  it("resuming the account never resumes Pro on its own", async () => {
    addSub();
    await stopProRenewalOnLeave("u1", "paused");
    // Only «متابعة الاشتراك» (resumePro) undoes it
    expect(s().subs[0].cancelAtPeriodEnd).toBe(true);
  });
});

describe("cancelProNow", () => {
  it("admin: cancels on Stripe at once, ENDED, tells the member, no refund and no take-back", async () => {
    addSub();
    addPayment("pay1", new Date());
    addGrant("g1", "pay1", 8);
    expect(await cancelProNow("ps1", { adminId: "a1", reason: "admin" })).toBe("ended");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false });
    expect(s().subs[0].status).toBe("ENDED");
    expect(s().subs[0].endedAt).toBeInstanceOf(Date);
    expect(await isPro("u1")).toBe(false);
    expect(s().users[0].matchCredits).toBe(10);
    expect(s().grants[0].takenBack).toBe(false);
    expect(s().payments[0].status).toBe("COMPLETED");
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT", title: "انتهت عضوية Pro", sms: false, url: "/dashboard/pro" }));
  });

  it("a subscription Stripe already cancelled still ends here", async () => {
    addSub();
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("already canceled"));
    stripe.subscriptions.retrieve.mockResolvedValueOnce({ status: "canceled" });
    expect(await cancelProNow("ps1", { reason: "admin" })).toBe("ended");
    expect(s().subs[0].status).toBe("ENDED");
  });

  it("a subscription Stripe no longer knows (resource_missing) counts as cancelled: deletion and admin cancel go through", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    addSub();
    stripe.subscriptions.cancel.mockRejectedValueOnce(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    expect(await cancelProNow("ps1", { reason: "deletion" })).toBe("ended");
    expect(s().subs[0].status).toBe("ENDED");
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("any other Stripe failure throws and keeps the membership", async () => {
    addSub();
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("stripe down"));
    await expect(cancelProNow("ps1", { reason: "admin" })).rejects.toThrow("stripe down");
    expect(s().subs[0].status).toBe("ACTIVE");
  });

  it("mock subscriptions end locally; an ended one is left alone", async () => {
    addSub({ stripeSubscriptionId: "mock_sub_pay1" });
    expect(await cancelProNow("ps1", { reason: "admin" })).toBe("ended");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(await cancelProNow("ps1", { reason: "admin" })).toBe("already");
    expect(await cancelProNow("nope", { reason: "admin" })).toBe("not_found");
  });
});

describe("cancelProForDeletion", () => {
  it("cancels every Stripe subscription that can still charge, even past its period, without a notice", async () => {
    addSub();
    addSub({ id: "ps2", stripeSubscriptionId: "sub_2", status: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - DAY) });
    addSub({ id: "ps3", stripeSubscriptionId: "sub_3", status: "ENDED" });
    expect(await cancelProForDeletion("u1")).toBe(2);
    expect(stripe.subscriptions.cancel.mock.calls.map((c) => c[0])).toEqual(["sub_1", "sub_2"]);
    expect(s().subs.map((r) => r.status)).toEqual(["ENDED", "ENDED", "ENDED"]);
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("a Stripe failure throws, so the deletion stops and is retried", async () => {
    addSub();
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("stripe down"));
    await expect(cancelProForDeletion("u1")).rejects.toThrow("stripe down");
  });
});

describe("applyRefund of a Pro payment", () => {
  it("yearly: takes back all of that year's grants (floored at 0) in one ledger row and ends Pro", async () => {
    addSub({ plan: "YEARLY", creditsPerGrant: 8, grantsMade: 3 });
    addPayment("pay1", new Date(Date.now() - 90 * DAY), { planName: "pro_yearly", amount: 40 });
    addGrant("g1", "pay1", 8);
    addGrant("g2", "pay1", 8);
    addGrant("g3", "pay1", 8);

    expect(await applyRefund({ paymentId: "pay1", adminId: "a1", note: "Admin refund" })).toBe("refunded");
    expect(s().payments[0].status).toBe("REFUNDED");
    expect(s().users[0].matchCredits).toBe(0);
    expect(s().ledger).toHaveLength(1);
    expect(s().ledger[0]).toMatchObject({ userId: "u1", delta: -10, reason: "REFUND", refId: "pay1", adminId: "a1" });
    expect(s().grants.every((g) => g.takenBack === true)).toBe(true);
    expect(s().subs[0].status).toBe("ENDED");
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1", { invoice_now: false, prorate: false });
    expect(await isPro("u1")).toBe(false);
    expect(notifyMock.notify).toHaveBeenCalledTimes(1);
    expect(notifyMock.notify.mock.calls[0][0]).toMatchObject({
      userId: "u1",
      type: "PAYMENT",
      sms: false,
      body: "تم استرداد 40 د.أ (56.40$) من اشتراك Pro إلى بطاقتك، وأُزيل رصيده من حسابك. وانتهت عضوية Pro.",
    });
  });

  it("an older invoice takes back only its own grants and keeps Pro", async () => {
    addSub();
    addPayment("pay1", new Date(Date.now() - 40 * DAY));
    addPayment("pay2", new Date(Date.now() - 10 * DAY));
    addGrant("g1", "pay1", 3);
    addGrant("g2", "pay2", 3);

    expect(await applyRefund({ paymentId: "pay1" })).toBe("refunded");
    expect(s().users[0].matchCredits).toBe(7);
    expect(s().ledger).toHaveLength(1);
    expect(s().ledger[0]).toMatchObject({ delta: -3, reason: "REFUND", refId: "pay1" });
    expect(s().grants.map((g) => g.takenBack)).toEqual([true, false]);
    expect(s().subs[0].status).toBe("ACTIVE");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(await isPro("u1")).toBe(true);
  });

  it("admin and webhook together take back once", async () => {
    addSub();
    addPayment("pay1", new Date());
    addGrant("g1", "pay1", 8);
    const [a, b] = await Promise.all([applyRefund({ paymentId: "pay1" }), applyRefund({ paymentId: "pay1" })]);
    expect([a, b].sort()).toEqual(["already", "refunded"]);
    expect(s().ledger).toHaveLength(1);
    expect(s().users[0].matchCredits).toBe(2);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });

  it("grants already taken back are not taken twice", async () => {
    addSub();
    addPayment("pay1", new Date());
    addGrant("g1", "pay1", 4);
    s().grants[0].takenBack = true;
    addGrant("g2", "pay1", 4);
    await applyRefund({ paymentId: "pay1" });
    expect(s().users[0].matchCredits).toBe(6);
  });

  it("a failed Stripe cancel still ends Pro here and alerts the admins", async () => {
    addSub();
    addPayment("pay1", new Date());
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("stripe down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await applyRefund({ paymentId: "pay1" })).toBe("refunded");
    spy.mockRestore();
    expect(s().subs[0].status).toBe("ENDED");
    expect(alert.sendAdminAlert).toHaveBeenCalledWith(expect.stringContaining("Pro"), expect.stringContaining("sub_1"), expect.anything());
  });

  it("a mock subscription ends locally without Stripe", async () => {
    addSub({ stripeSubscriptionId: "mock_sub_pay1" });
    addPayment("pay1", new Date());
    expect(await applyRefund({ paymentId: "pay1" })).toBe("refunded");
    expect(s().subs[0].status).toBe("ENDED");
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

describe("minor fixes", () => {
  it("cancelProNow: the deleted webhook ended the row between our Stripe cancel and our write → still 'ended', no second notice", async () => {
    addSub();
    stripe.subscriptions.cancel.mockImplementation(async () => {
      // The webhook of this very cancel commits first
      s().subs[0].status = "ENDED";
      s().subs[0].endedAt = new Date();
      return { status: "canceled" };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cancelProNow("ps1", { reason: "admin", adminId: "a1" })).toBe("ended");
    log.mockRestore();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("applyRefund: a failure while ending Pro after the refund never escapes, and the member still gets the refund notice", async () => {
    addSub();
    addPayment("pay1", new Date());
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("stripe down"));
    alert.sendAdminAlert.mockRejectedValueOnce(new Error("mail down"));
    const update = fake.current.db.proSubscription.updateMany;
    fake.current.db.proSubscription.updateMany = vi.fn(async () => {
      throw new Error("db blip");
    }) as typeof update;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await applyRefund({ paymentId: "pay1" })).toBe("refunded");
    } finally {
      fake.current.db.proSubscription.updateMany = update;
      spy.mockRestore();
    }
    expect(notifyMock.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "تم استرداد المبلغ", url: "/dashboard/pro" }));
  });
});
