import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  payment: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  proCreditGrant: { groupBy: vi.fn() },
  proSubscription: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })) }));
vi.mock("@/lib/admin/country-filter", () => ({ getAdminCountry: async () => null, paymentCountryWhere: () => ({}) }));

import { GET } from "@/app/api/admin/payments/route";

const user = { id: "u1", firstName: "س", lastName: "د", phone: "962", country: "JO", matchCredits: 102 };
const base = { amount: "35", currency: "JOD", status: "COMPLETED", disputedAt: null, failureReason: null, providerTxId: "in_x", stripePaymentIntentId: null, proNotLive: null, createdAt: new Date(), user };

beforeEach(() => {
  vi.clearAllMocks();
  db.payment.count.mockResolvedValue(3);
  db.payment.groupBy.mockResolvedValue([]);
});

describe("Admin → Payments refund facts (QA WEB-PAY-02, 09)", () => {
  it("a Pro payment's credits are its grants; the live period's payment ends Pro; later payments are renewals", async () => {
    db.payment.findMany
      .mockResolvedValueOnce([
        { ...base, id: "p2", planName: "pro_yearly", proSubscriptionId: "s1" },
        { ...base, id: "p1", planName: "pro_yearly", proSubscriptionId: "s1" },
        { ...base, id: "k1", planName: "launch_10", proSubscriptionId: null },
      ])
      .mockResolvedValueOnce([
        { id: "p1", status: "COMPLETED", proSubscriptionId: "s1" },
        { id: "p2", status: "COMPLETED", proSubscriptionId: "s1" },
      ]);
    db.proCreditGrant.groupBy.mockResolvedValue([{ paymentId: "p2", _sum: { credits: 16 } }]);
    db.proSubscription.findMany.mockResolvedValue([{ id: "s1" }]);
    const data = await (await GET(new Request("http://x/api/admin/payments"))).json();
    const byId = Object.fromEntries(data.payments.map((p: { id: string }) => [p.id, p]));
    expect(byId.p2).toMatchObject({ credits: 16, endsPro: true, renewal: true });
    expect(byId.p1).toMatchObject({ credits: 0, endsPro: false, renewal: false });
    expect(byId.k1).toMatchObject({ credits: 10, endsPro: false, renewal: false });
    expect(byId.p2.proSubscriptionId).toBeUndefined();
  });
});
