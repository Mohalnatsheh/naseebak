import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({
  payment: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));

import { GET } from "@/app/api/payments/history/route";

describe("GET /api/payments/history (QA WEB-PAY-06)", () => {
  it("older pack rows read with the right Arabic count; Pro rows keep their text", async () => {
    db.payment.findMany.mockResolvedValue([
      { id: "a", type: "MATCH_CREDITS", planName: "launch_50", description: "شراء 50 أرصدة في نصيبك" },
      { id: "b", type: "MATCH_CREDITS", planName: "credits_10", description: "[MOCK] شراء 10 أرصدة في نصيبك" },
      { id: "c", type: "SUBSCRIPTION", planName: "pro_monthly", description: "اشتراك نصيبك Pro (شهري)" },
    ]);
    db.payment.count.mockResolvedValue(3);
    db.user.findUnique.mockResolvedValue({ matchCredits: 3 });
    const data = await (await GET(new Request("http://x/api/payments/history"))).json();
    const d = data.payments.map((p: { description: string }) => p.description);
    expect(d[0]).toBe("شراء 50 رصيداً في نصيبك");
    expect(d[1]).toBe("[MOCK] شراء 10 أرصدة في نصيبك");
    expect(d[2]).toBe("اشتراك نصيبك Pro (شهري)");
  });

  it("a purchase made during a sale offer shows the credits it really gave", async () => {
    db.payment.findMany.mockResolvedValue([
      { id: "a", type: "MATCH_CREDITS", planName: "launch_10", bonusCredits: 5, description: "شراء 15 رصيداً في نصيبك" },
    ]);
    db.payment.count.mockResolvedValue(1);
    db.user.findUnique.mockResolvedValue({ matchCredits: 15 });
    const data = await (await GET(new Request("http://x/api/payments/history"))).json();
    expect(data.payments[0].description).toBe("شراء 15 رصيداً في نصيبك");
  });
});
