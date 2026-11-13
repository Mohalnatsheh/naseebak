import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  proSubscription: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  proCreditGrant: { create: vi.fn() },
  user: { update: vi.fn() },
  creditLedger: { create: vi.fn() },
  payment: { findFirst: vi.fn() },
}));
const notifyMock = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMock);

import { grantProCredits, nextYearlyGrantDate, runYearlyProGrants } from "@/lib/pro/grants";

const sub = { id: "s1", userId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.proSubscription.findUnique.mockResolvedValue(sub);
  db.proSubscription.update.mockResolvedValue({});
  db.proCreditGrant.create.mockResolvedValue({ id: "g1" });
  db.user.update.mockResolvedValue({});
  db.creditLedger.create.mockResolvedValue({});
  db.payment.findFirst.mockResolvedValue({ id: "pay1" });
});

describe("grantProCredits", () => {
  it("an extra grant (sale offer bonus) never counts as one of the year's grants", async () => {
    const r = await grantProCredits({ subscriptionId: "s1", paymentId: "pay1", key: "offer:in_1", credits: 4, silent: true, extra: true });
    expect(r).toBe("granted");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 4 } } });
    expect(db.proSubscription.update).not.toHaveBeenCalled();
  });

  it("grants once: grant row, credits, ledger, counter, notice", async () => {
    const r = await grantProCredits({ subscriptionId: "s1", paymentId: "pay1", key: "invoice:in_1", credits: 5 });
    expect(r).toBe("granted");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 5 } } });
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", delta: 5, reason: "PRO_GRANT", refId: "g1", note: "invoice:in_1" }),
    });
    expect(db.proSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { grantsMade: { increment: 1 } } });
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "PAYMENT", title: "رصيد Pro", sms: false, url: "/dashboard/pro" })
    );
    expect(notifyMock.notify.mock.calls[0][0].body).toBe("أُضيف 5 أرصدة إلى رصيدك من اشتراك Pro.");
  });

  it("reads naturally for 1, 2 and 11 credits", async () => {
    const bodies: string[] = [];
    for (const n of [1, 2, 11]) {
      await grantProCredits({ subscriptionId: "s1", paymentId: null, key: `k${n}`, credits: n });
      bodies.push(notifyMock.notify.mock.calls.at(-1)![0].body);
    }
    expect(bodies).toEqual([
      "أُضيف رصيد واحد إلى رصيدك من اشتراك Pro.",
      "أُضيف رصيدان إلى رصيدك من اشتراك Pro.",
      "أُضيف 11 رصيداً إلى رصيدك من اشتراك Pro.",
    ]);
  });

  it("the same key again changes nothing", async () => {
    db.proCreditGrant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    const r = await grantProCredits({ subscriptionId: "s1", paymentId: "pay1", key: "invoice:in_1", credits: 5 });
    expect(r).toBe("already");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.creditLedger.create).not.toHaveBeenCalled();
    expect(notifyMock.notify).not.toHaveBeenCalled();
  });

  it("other errors propagate", async () => {
    db.proCreditGrant.create.mockRejectedValue(new Error("db down"));
    await expect(grantProCredits({ subscriptionId: "s1", paymentId: null, key: "k", credits: 1 })).rejects.toThrow("db down");
  });

  it("credits <= 0 writes nothing", async () => {
    expect(await grantProCredits({ subscriptionId: "s1", paymentId: null, key: "k", credits: 0 })).toBe("already");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("grantProCredits restartYear (a yearly invoice)", () => {
  it("sets the per-year count to 1 with the next date, in the grant's transaction", async () => {
    const next = new Date("2027-12-09T10:00:00Z");
    expect(await grantProCredits({ subscriptionId: "s1", paymentId: "pay2", key: "invoice:in_2", credits: 10, restartYear: true, advanceNextTo: next })).toBe("granted");
    expect(db.proSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { grantsMade: 1, nextCreditGrantAt: next } });
  });

  it("a re-delivered invoice (key used) resets nothing", async () => {
    db.proCreditGrant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    expect(await grantProCredits({ subscriptionId: "s1", paymentId: "pay2", key: "invoice:in_2", credits: 10, restartYear: true, advanceNextTo: new Date() })).toBe("already");
    expect(db.proSubscription.update).not.toHaveBeenCalled();
  });
});

describe("runYearlyProGrants", () => {
  const now = new Date("2026-11-09T06:00:00Z");

  it("selects only live yearly subscriptions that are due", async () => {
    db.proSubscription.findMany.mockResolvedValue([]);
    await runYearlyProGrants(now);
    const args = db.proSubscription.findMany.mock.calls[0][0];
    expect(args.take).toBe(500);
    expect(args.where).toMatchObject({
      plan: "YEARLY",
      status: { in: ["ACTIVE", "PAST_DUE"] },
      currentPeriodEnd: { gt: now },
      nextCreditGrantAt: { lte: now },
      grantsMade: { lt: 12 },
    });
  });

  it("grants nothing when nothing is due (grantsMade 12 is filtered out)", async () => {
    db.proSubscription.findMany.mockResolvedValue([]);
    expect(await runYearlyProGrants(now)).toEqual({ granted: 0 });
    expect(db.proCreditGrant.create).not.toHaveBeenCalled();
  });

  it("grants month 4 with the right key and moves the date one month on", async () => {
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s1", userId: "u1", grantsMade: 3, creditsPerGrant: 4, nextCreditGrantAt: new Date("2026-11-01T06:00:00Z") },
    ]);
    const r = await runYearlyProGrants(now);
    expect(r).toEqual({ granted: 1 });
    expect(db.proCreditGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ key: "yearly:pay1:4", subscriptionId: "s1", paymentId: "pay1", credits: 4 }),
    });
    // The paid year now running: the latest completed yearly payment
    expect(db.payment.findFirst).toHaveBeenCalledWith({
      where: { proSubscriptionId: "s1", status: "COMPLETED", planName: "pro_yearly" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    expect(db.proSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { grantsMade: { increment: 1 }, nextCreditGrantAt: new Date("2026-12-01T06:00:00Z") },
    });
  });

  it("a canceled-at-period-end subscription still gets its grant while the period runs", async () => {
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s2", userId: "u2", grantsMade: 1, creditsPerGrant: 2, nextCreditGrantAt: new Date("2026-11-05T06:00:00Z"), cancelAtPeriodEnd: true },
    ]);
    expect(await runYearlyProGrants(now)).toEqual({ granted: 1 });
    // the query must not exclude cancelAtPeriodEnd
    db.proSubscription.findMany.mockResolvedValue([]);
    await runYearlyProGrants(now);
    expect(db.proSubscription.findMany.mock.calls.at(-1)![0].where).not.toHaveProperty("cancelAtPeriodEnd");
  });

  it("moves the date inside the grant transaction, survives a failing notice, and never grants twice", async () => {
    const state = { id: "s1", userId: "u1", grantsMade: 3, creditsPerGrant: 4, nextCreditGrantAt: new Date("2026-11-01T06:00:00Z") };
    db.proSubscription.findMany.mockImplementation(async () => (state.nextCreditGrantAt <= now ? [{ ...state }] : []));
    const txClient = {
      ...db,
      proSubscription: {
        ...db.proSubscription,
        update: vi.fn(async ({ data }: { data: { nextCreditGrantAt?: Date } }) => {
          if (data.nextCreditGrantAt) state.nextCreditGrantAt = data.nextCreditGrantAt;
          return {};
        }),
      },
    };
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(txClient as unknown as typeof db));
    notifyMock.notify.mockRejectedValue(new Error("push down"));

    expect(await runYearlyProGrants(now)).toEqual({ granted: 1 });
    expect(txClient.proSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { grantsMade: { increment: 1 }, nextCreditGrantAt: new Date("2026-12-01T06:00:00Z") },
    });
    expect(db.proSubscription.update).not.toHaveBeenCalled(); // no separate write outside the transaction
    expect(await runYearlyProGrants(now)).toEqual({ granted: 0 });
    expect(db.proCreditGrant.create).toHaveBeenCalledTimes(1);
  });

  it("no completed yearly payment: grants nothing and writes nothing", async () => {
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s1", userId: "u1", grantsMade: 3, creditsPerGrant: 4, nextCreditGrantAt: new Date("2026-11-01T06:00:00Z") },
    ]);
    db.payment.findFirst.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await runYearlyProGrants(now)).toEqual({ granted: 0 });
    } finally {
      warn.mockRestore();
    }
    expect(db.proCreditGrant.create).not.toHaveBeenCalled();
    expect(db.proSubscription.update).not.toHaveBeenCalled();
  });

  it("an already-granted key still moves the date on, and is not counted", async () => {
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s1", userId: "u1", grantsMade: 3, creditsPerGrant: 4, nextCreditGrantAt: new Date("2026-11-01T06:00:00Z") },
    ]);
    db.proCreditGrant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    expect(await runYearlyProGrants(now)).toEqual({ granted: 0 });
    expect(db.proSubscription.update).toHaveBeenCalledTimes(1);
  });
});

describe("yearly grant dates", () => {
  it("stay on the year's start day through short months: 31 Jan → 28 Feb → 31 Mar, never drifting to the 28th", () => {
    // A year that started 31 Jan 2027 ends 31 Jan 2028; month 2 is due 28 Feb
    const end = new Date("2028-01-31T09:00:00Z");
    const feb = new Date("2027-02-28T09:00:00Z");
    const mar = nextYearlyGrantDate(feb, end, 2);
    expect(mar).toEqual(new Date("2027-03-31T09:00:00Z"));
    expect(nextYearlyGrantDate(mar, end, 3)).toEqual(new Date("2027-04-30T09:00:00Z"));
    expect(nextYearlyGrantDate(new Date("2027-04-30T09:00:00Z"), end, 4)).toEqual(new Date("2027-05-31T09:00:00Z"));
  });

  it("twelve grants fit the year: month 12's next date is the period end", () => {
    const end = new Date("2028-01-31T09:00:00Z");
    expect(nextYearlyGrantDate(new Date("2027-12-31T09:00:00Z"), end, 12)).toEqual(end);
  });

  it("falls back to one month after the planned date without a usable period end, and never goes back", () => {
    expect(nextYearlyGrantDate(new Date("2026-11-01T06:00:00Z"), null, 4)).toEqual(new Date("2026-12-01T06:00:00Z"));
    expect(nextYearlyGrantDate(new Date("2026-11-01T06:00:00Z"), new Date("2026-01-01T06:00:00Z"), 4)).toEqual(new Date("2026-12-01T06:00:00Z"));
  });

  it("a run that fell a month behind until the renewal moved the period end a year on: the next date stays a month on", () => {
    // Paid year 31 Jan 2027 – 31 Jan 2028, renewed: the period end is now 31 Jan 2029, month 12 still owed
    const renewedEnd = new Date("2029-01-31T09:00:00Z");
    expect(nextYearlyGrantDate(new Date("2027-12-31T09:00:00Z"), renewedEnd, 12)).toEqual(new Date("2028-01-31T09:00:00Z"));
    expect(nextYearlyGrantDate(new Date("2027-11-30T09:00:00Z"), renewedEnd, 11)).toEqual(new Date("2027-12-30T09:00:00Z"));
  });

  it("the morning run anchors on the period end", async () => {
    const now = new Date("2027-02-28T10:00:00Z");
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s1", userId: "u1", grantsMade: 1, creditsPerGrant: 4, nextCreditGrantAt: new Date("2027-02-28T09:00:00Z"), currentPeriodEnd: new Date("2028-01-31T09:00:00Z") },
    ]);
    await runYearlyProGrants(now);
    expect(db.proSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { grantsMade: { increment: 1 }, nextCreditGrantAt: new Date("2027-03-31T09:00:00Z") },
    });
  });
});

describe("a subscription with no member", () => {
  it("grants nothing and says so in the log", async () => {
    db.proSubscription.findUnique.mockResolvedValue({ id: "s1", userId: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await grantProCredits({ subscriptionId: "s1", paymentId: "p", key: "invoice:x", credits: 3 })).toBe("already");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no member"), "s1", "invoice:x");
      expect(db.user.update).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
