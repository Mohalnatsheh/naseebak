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

import { grantProCredits, runYearlyProGrants } from "@/lib/pro/grants";

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
  it("grants once: grant row, credits, ledger, counter, notice", async () => {
    const r = await grantProCredits({ subscriptionId: "s1", paymentId: "pay1", key: "invoice:in_1", credits: 5 });
    expect(r).toBe("granted");
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 5 } } });
    expect(db.creditLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", delta: 5, reason: "PRO_GRANT", refId: "g1", note: "invoice:in_1" }),
    });
    expect(db.proSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { grantsMade: { increment: 1 } } });
    expect(notifyMock.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "PAYMENT", title: "رصيد Pro", sms: false, url: "/dashboard/payments" })
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
      data: expect.objectContaining({ key: "yearly:s1:4", subscriptionId: "s1", paymentId: "pay1", credits: 4 }),
    });
    expect(db.proSubscription.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { nextCreditGrantAt: new Date("2026-12-01T06:00:00Z") },
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

  it("an already-granted key still moves the date on, and is not counted", async () => {
    db.proSubscription.findMany.mockResolvedValue([
      { id: "s1", userId: "u1", grantsMade: 3, creditsPerGrant: 4, nextCreditGrantAt: new Date("2026-11-01T06:00:00Z") },
    ]);
    db.proCreditGrant.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    expect(await runYearlyProGrants(now)).toEqual({ granted: 0 });
    expect(db.proSubscription.update).toHaveBeenCalledTimes(1);
  });
});
