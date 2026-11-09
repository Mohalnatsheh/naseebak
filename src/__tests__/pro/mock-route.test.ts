import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
  proSubscription: { findFirst: vi.fn() },
}));
const pro = vi.hoisted(() => ({
  handleProCheckoutCompleted: vi.fn(),
  handleProInvoicePaid: vi.fn(),
  handleProInvoiceFailed: vi.fn(),
  handleProSubscriptionChanged: vi.fn(),
}));
const fulfil = vi.hoisted(() => ({ fulfilCheckoutSession: vi.fn(), CHECKOUT_APP: "naseebak" }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/payments/fulfil", () => fulfil);
vi.mock("@/lib/pro/stripe-events", () => pro);

import { POST } from "@/app/api/dev/mock-checkout/[id]/route";
import { invoiceMetadata, invoicePeriod, invoiceSubscriptionId, subscriptionPeriodEnd } from "@/lib/pro/stripe-shapes";

const post = (outcome: string) => POST(new Request("http://x", { method: "POST", body: JSON.stringify({ outcome }) }), { params: Promise.resolve({ id: "pay1" }) });
const META = { app: "naseebak", kind: "pro", userId: "u1", plan: "monthly", country: "JO", paymentId: "pay1" };
const created = new Date("2026-11-09T10:00:00Z");
const periodEnd = new Date("2026-12-09T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENTS_MOCK", "true");
  vi.stubEnv("NODE_ENV", "development");
  db.payment.findFirst.mockResolvedValue({ id: "pay1", status: "PENDING", stripeSessionId: "mock_pro_x", planName: "pro_monthly", amount: 4, currency: "JOD", createdAt: created });
  db.user.findUnique.mockResolvedValue({ country: "JO" });
  db.proSubscription.findFirst.mockResolvedValue({ id: "ps1", country: "JO", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false });
  db.payment.count.mockResolvedValue(1);
  for (const fn of Object.values(pro)) fn.mockResolvedValue("ok");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/dev/mock-checkout/[id] for Pro", () => {
  it("stays 404 off-mock", async () => {
    vi.stubEnv("PAYMENTS_MOCK", "");
    for (const o of ["paid", "renew", "fail", "end"]) expect((await post(o)).status).toBe(404);
    expect(pro.handleProInvoicePaid).not.toHaveBeenCalled();
  });

  it("«paid» runs checkout-completed then invoice-paid with Stripe-shaped fakes, invoice mock_in_<paymentId>", async () => {
    const res = await post("paid");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "ok", checkout: "ok" });
    const session = pro.handleProCheckoutCompleted.mock.calls[0][0];
    expect(session).toMatchObject({ id: "mock_pro_x", mode: "subscription", payment_status: "paid", subscription: "mock_sub_pay1", metadata: META });
    const invoice = pro.handleProInvoicePaid.mock.calls[0][0];
    expect(invoice.id).toBe("mock_in_pay1");
    expect(invoiceMetadata(invoice)).toEqual(META);
    expect(invoiceSubscriptionId(invoice)).toBe("mock_sub_pay1");
    expect(invoicePeriod(invoice)).toEqual({ start: created, end: periodEnd });
    expect(invoice.amount_paid).toBeGreaterThan(0);
    expect(fulfil.fulfilCheckoutSession).not.toHaveBeenCalled();
  });

  it("«renew» pays a new invoice for the next period", async () => {
    await post("renew");
    const invoice = pro.handleProInvoicePaid.mock.calls[0][0];
    expect(invoice.id).toBe("mock_in_pay1_1");
    expect(invoice.billing_reason).toBe("subscription_cycle");
    expect(invoicePeriod(invoice)).toEqual({ start: periodEnd, end: new Date("2027-01-09T10:00:00Z") });
    expect(pro.handleProCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("«fail» and «end» call the failed and deleted handlers", async () => {
    await post("fail");
    const failed = pro.handleProInvoiceFailed.mock.calls[0][0];
    expect(invoiceSubscriptionId(failed)).toBe("mock_sub_pay1");
    expect(invoiceMetadata(failed)).toEqual(META);
    await post("end");
    const [sub, kind] = pro.handleProSubscriptionChanged.mock.calls[0];
    expect(kind).toBe("deleted");
    expect(sub).toMatchObject({ id: "mock_sub_pay1", status: "canceled", metadata: META });
    expect(subscriptionPeriodEnd(sub)).toEqual(periodEnd);
  });

  it("«renew», «fail», «end» need the subscription to exist", async () => {
    db.proSubscription.findFirst.mockResolvedValue(null);
    for (const o of ["renew", "fail", "end"]) expect((await post(o)).status).toBe(409);
  });

  it("«renew» etc. are refused for a credit package", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "pay1", status: "PENDING", stripeSessionId: "mock_x", planName: "launch_25", amount: 6, currency: "JOD", createdAt: created });
    expect((await post("renew")).status).toBe(400);
  });
});
