import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  suggestion: { findUnique: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
}));
const mutual = vi.hoisted(() => ({ refundUnansweredInterests: vi.fn(async () => ({ refunded: 1 })) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin" } } })) }));
vi.mock("@/lib/suggestions/mutual", () => mutual);

import { DELETE } from "@/app/api/admin/suggestions/[id]/route";

const del = () => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "s1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.suggestion.updateMany.mockResolvedValue({ count: 1 });
});

describe("DELETE /api/admin/suggestions/[id] (G62)", () => {
  it("closes an open shared suggestion instead of deleting it, and refunds both sides' unanswered «مهتم»", async () => {
    db.suggestion.findUnique.mockResolvedValue({ id: "s1", flow: "MUTUAL", status: "PENDING", recipientId: "a", candidateId: "b" });
    const res = await del();
    expect(res.status).toBe(200);
    expect(db.suggestion.delete).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "PENDING" },
      data: { status: "EXPIRED", expiresAt: expect.any(Date) },
    });
    expect(mutual.refundUnansweredInterests).toHaveBeenCalledWith({ userId: "a", now: expect.any(Date) });
    expect(mutual.refundUnansweredInterests).toHaveBeenCalledWith({ userId: "b", now: expect.any(Date) });
  });

  it("keeps a closed shared suggestion (409)", async () => {
    db.suggestion.findUnique.mockResolvedValue({ id: "s1", flow: "MUTUAL", status: "ACCEPTED", recipientId: "a", candidateId: "b" });
    expect((await del()).status).toBe(409);
    expect(db.suggestion.delete).not.toHaveBeenCalled();
    expect(db.suggestion.updateMany).not.toHaveBeenCalled();
  });

  it("still deletes a legacy suggestion", async () => {
    db.suggestion.findUnique.mockResolvedValue({ id: "s1", flow: "LEGACY", status: "PENDING", recipientId: "a", candidateId: "b" });
    expect((await del()).status).toBe(200);
    expect(db.suggestion.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mutual.refundUnansweredInterests).not.toHaveBeenCalled();
  });
});
