import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { updateMany: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}));
const credits = vi.hoisted(() => ({ recordCredit: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
const stripe = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/credits", () => credits);
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { list: stripe.list } } }) }));

import { fulfilCheckoutSession, reconcileStripePayments } from "@/lib/payments/fulfil";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = (over: Record<string, unknown> = {}): any => ({
  id: "cs_1",
  payment_status: "paid",
  payment_intent: "pi_1",
  metadata: { paymentId: "p1", userId: "u1", credits: "5" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.payment.updateMany.mockResolvedValue({ count: 1 });
  process.env.STRIPE_SECRET_KEY = "sk_test";
});

describe("fulfilCheckoutSession", () => {
  it("marks the payment completed and adds the credits, history and a notice", async () => {
    expect(await fulfilCheckoutSession(session())).toBe("fulfilled");
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", userId: "u1", status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", providerTxId: "pi_1" },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { matchCredits: { increment: 5 } } });
    expect(credits.recordCredit).toHaveBeenCalledWith({ userId: "u1", delta: 5, reason: "PURCHASE", refId: "p1" });
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "PAYMENT" }));
  });

  it("adds nothing the second time (webhook and return page both arrive)", async () => {
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    expect(await fulfilCheckoutSession(session())).toBe("already");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(credits.recordCredit).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });

  it("does nothing until the money is in", async () => {
    expect(await fulfilCheckoutSession(session({ payment_status: "unpaid" }))).toBe("not_paid");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("leaves other sites' checkouts alone and refuses broken metadata", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fulfilCheckoutSession(session({ metadata: { paymentId: "p1", userId: "u1", credits: "x" } }))).toBe("invalid");
    expect(await fulfilCheckoutSession(session({ metadata: { app: "naseebak", paymentId: "p1" } }))).toBe("invalid");
    expect(await fulfilCheckoutSession(session({ metadata: {} }))).toBe("not_ours");
    expect(await fulfilCheckoutSession(session({ metadata: { order_id: "wc_55" } }))).toBe("not_ours");
    expect(db.$transaction).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("reconcileStripePayments", () => {
  it("fulfils paid sessions from the last days and skips the rest", async () => {
    stripe.list.mockReturnValue(
      (async function* () {
        yield session({ id: "cs_paid" });
        yield session({ id: "cs_open", payment_status: "unpaid" });
        yield session({ id: "cs_other", metadata: {} });
      })()
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await reconcileStripePayments(new Date("2026-10-18T03:00:00Z"));
    warn.mockRestore();
    expect(r).toEqual({ checked: 1, fulfilled: 1 });
    const since = Math.floor(new Date("2026-10-18T03:00:00Z").getTime() / 1000) - 3 * 86400;
    expect(stripe.list).toHaveBeenCalledWith({ created: { gte: since }, limit: 100 });
  });

  it("counts already-credited sessions as checked, not fulfilled", async () => {
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    stripe.list.mockReturnValue((async function* () { yield session(); })());
    expect(await reconcileStripePayments()).toEqual({ checked: 1, fulfilled: 0 });
  });

  it("skips quietly without a Stripe key", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(await reconcileStripePayments()).toEqual({ checked: 0, fulfilled: 0 });
    expect(stripe.list).not.toHaveBeenCalled();
  });
});
