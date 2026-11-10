import { describe, it, expect, vi, beforeEach } from "vitest";
// Stripe is configured in these tests (the refund route refuses without a key: QA WEB-PAY-12)
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

const db = vi.hoisted(() => ({
  proSubscription: { findFirst: vi.fn(), findMany: vi.fn() },
  payment: { findUnique: vi.fn() },
}));
const manage = vi.hoisted(() => ({ cancelPro: vi.fn(), resumePro: vi.fn(), cancelProNow: vi.fn() }));
const auth = vi.hoisted(() => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
const stripe = vi.hoisted(() => ({ refunds: { create: vi.fn() } }));
const refundMod = vi.hoisted(() => ({ applyRefund: vi.fn() }));
const invoices = vi.hoisted(() => ({ paymentIntentForInvoice: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/pro/manage", () => manage);
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/pro/status", () => ({ isPro: async () => true }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe }));
vi.mock("@/lib/payments/refund", () => refundMod);
vi.mock("@/lib/pro/invoice-payments", () => invoices);

import { POST as cancel } from "@/app/api/pro/cancel/route";
import { POST as resume } from "@/app/api/pro/resume/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/users/[id]/pro/route";
import { POST as adminRefund } from "@/app/api/admin/payments/[id]/refund/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireUser.mockResolvedValue({ session: { user: { id: "u1" } } });
  auth.requireAdmin.mockResolvedValue({ session: { user: { id: "a1", role: "ADMIN" } } });
  manage.cancelPro.mockResolvedValue("ok");
  manage.resumePro.mockResolvedValue("ok");
  manage.cancelProNow.mockResolvedValue("ended");
  db.proSubscription.findFirst.mockResolvedValue({ id: "ps1" });
  db.proSubscription.findMany.mockResolvedValue([]);
  refundMod.applyRefund.mockResolvedValue("refunded");
});

describe("paused members (QA WP2-02)", () => {
  it("may cancel the renewal while paused, but resume waits for reactivation", async () => {
    await cancel();
    expect(auth.requireUser).toHaveBeenLastCalledWith({ allowDeactivated: true });
    await resume();
    expect(auth.requireUser).toHaveBeenLastCalledWith({ allowDeactivated: false });
  });
});

describe("member cancel / resume", () => {
  it("cancels and resumes for the signed-in member", async () => {
    expect((await cancel()).status).toBe(200);
    expect(manage.cancelPro).toHaveBeenCalledWith("u1");
    const res = await resume();
    expect(await res.json()).toEqual({ ok: true, cancelAtPeriodEnd: false });
    expect(manage.resumePro).toHaveBeenCalledWith("u1");
  });

  it("no live membership: 404 with an Arabic message", async () => {
    manage.cancelPro.mockResolvedValue("none");
    const res = await cancel();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("لا يوجد اشتراك Pro فعّال.");
  });

  it("a Stripe failure: an Arabic error, not a crash", async () => {
    manage.cancelPro.mockRejectedValue(new Error("stripe"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cancel();
    spy.mockRestore();
    expect(res.status).toBe(502);
  });

  it("refuses without a signed-in member", async () => {
    auth.requireUser.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    expect((await cancel()).status).toBe(401);
    expect(manage.cancelPro).not.toHaveBeenCalled();
  });
});

describe("admin Pro panel", () => {
  it("only admins", async () => {
    auth.requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await adminGet(new Request("http://x"), params("u1"))).status).toBe(403);
    expect((await adminPost(post({ action: "cancel_now" }), params("u1"))).status).toBe(403);
    expect(manage.cancelProNow).not.toHaveBeenCalled();
  });

  it("cancel now ends the member's chargeable membership, logged with the admin", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await adminPost(post({ action: "cancel_now" }), params("u1"));
    expect(res.status).toBe(200);
    expect(db.proSubscription.findFirst.mock.calls[0][0].where).toEqual({ userId: "u1", status: { in: ["ACTIVE", "PAST_DUE"] } });
    expect(manage.cancelProNow).toHaveBeenCalledWith("ps1", { adminId: "a1", reason: "admin" });
    expect(log.mock.calls.some((c) => String(c[0]).includes("[admin-pro]") && String(c[0]).includes("a1"))).toBe(true);
    log.mockRestore();
  });

  it("rejects a bad action and a member without a membership", async () => {
    expect((await adminPost(post({ action: "refund" }), params("u1"))).status).toBe(400);
    db.proSubscription.findFirst.mockResolvedValue(null);
    expect((await adminPost(post({ action: "cancel_now" }), params("u1"))).status).toBe(404);
  });
});

describe("admin refund of a Pro payment", () => {
  it("refunds the payment intent that paid the invoice", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "in_1", provider: "STRIPE", planName: "pro_monthly" });
    invoices.paymentIntentForInvoice.mockResolvedValue("pi_1");
    expect((await adminRefund(new Request("http://x", { method: "POST" }), params("p1"))).status).toBe(200);
    expect(invoices.paymentIntentForInvoice).toHaveBeenCalledWith("in_1");
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-p1" });
    expect(refundMod.applyRefund).toHaveBeenCalledWith({ paymentId: "p1", adminId: "a1", note: "Admin refund" });
  });

  it("a local mock invoice is refunded here only", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "mock_in_p1", provider: "STRIPE", planName: "pro_monthly" });
    expect((await adminRefund(new Request("http://x", { method: "POST" }), params("p1"))).status).toBe(200);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(invoices.paymentIntentForInvoice).not.toHaveBeenCalled();
  });

  it("a local mock pack payment is refunded here only, never sent to Stripe (QA WEB-PAY-12)", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "mock_cs_p1", provider: "STRIPE", planName: "launch_10" });
    expect((await adminRefund(new Request("http://x", { method: "POST" }), params("p1"))).status).toBe(200);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(refundMod.applyRefund).toHaveBeenCalledWith({ paymentId: "p1", adminId: "a1", note: "Admin refund" });
  });

  it("without a Stripe key a real payment gets a readable 503, nothing changes", async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "pi_9", provider: "STRIPE", planName: "launch_10" });
    const res = await adminRefund(new Request("http://x", { method: "POST" }), params("p1"));
    process.env.STRIPE_SECRET_KEY = key;
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("Stripe is not configured");
    expect(refundMod.applyRefund).not.toHaveBeenCalled();
  });

  it("an invoice Stripe cannot match to a payment is refused, nothing changes", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "in_1", provider: "STRIPE", planName: "pro_monthly" });
    invoices.paymentIntentForInvoice.mockResolvedValue(null);
    expect((await adminRefund(new Request("http://x", { method: "POST" }), params("p1"))).status).toBe(400);
    expect(refundMod.applyRefund).not.toHaveBeenCalled();
  });

  it("a credit package still refunds its own payment intent", async () => {
    db.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETED", providerTxId: "pi_9", provider: "STRIPE", planName: "credits_5" });
    await adminRefund(new Request("http://x", { method: "POST" }), params("p1"));
    expect(invoices.paymentIntentForInvoice).not.toHaveBeenCalled();
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_9" }, { idempotencyKey: "refund-p1" });
  });
});
