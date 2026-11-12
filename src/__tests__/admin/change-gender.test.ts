import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  profile: { update: vi.fn() },
  suggestion: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const suggest = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), clearSuggestCooldown: vi.fn() }));
const mutual = vi.hoisted(() => ({ refundUnansweredInterests: vi.fn() }));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/matching/auto-suggest", () => suggest);
vi.mock("@/lib/suggestions/mutual", () => mutual);
vi.mock("@/lib/auth", () => auth);

import { changeMemberGender } from "@/lib/admin/change-gender";
import { POST } from "@/app/api/admin/users/[id]/gender/route";

const member = (over: object = {}) => ({
  gender: "MALE",
  role: "USER",
  profile: { dealbreakers: ["age", "hijab", "beard", "city"] },
  _count: { matchesAsFemale: 0, matchesAsMale: 0 },
  ...over,
});
const NOW = new Date("2026-11-12T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.suggestion.updateMany.mockResolvedValue({ count: 4 });
  mutual.refundUnansweredInterests.mockResolvedValue({ refunded: 2 });
  suggest.autoSuggestForUser.mockResolvedValue(3);
  auth.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1" } } });
});

describe("changeMemberGender", () => {
  it("switches the gender, clears gender-only answers, closes every open card, refunds and tops up", async () => {
    db.user.findUnique.mockResolvedValue(member());
    const res = await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "wrong at sign-up", now: NOW });

    expect(res).toEqual({ ok: true, from: "MALE", to: "FEMALE", closed: 4, refunded: 2 });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { gender: "FEMALE" } });
    expect(db.profile.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { hijab: null, niqab: null, beard: null, prefHijab: null, prefBeard: null, dealbreakers: ["age", "city"] },
    });
    // Every open shared card, answered or not: they were all with the wrong side
    expect(db.suggestion.updateMany).toHaveBeenCalledWith({
      where: { flow: "MUTUAL", status: "PENDING", OR: [{ recipientId: "u1" }, { candidateId: "u1" }] },
      data: { status: "EXPIRED", expiresAt: NOW, closedByChange: true },
    });
    expect(mutual.refundUnansweredInterests).toHaveBeenCalledWith({ userId: "u1", now: NOW });
    expect(suggest.clearSuggestCooldown).toHaveBeenCalledWith("u1");
    expect(suggest.autoSuggestForUser).toHaveBeenCalledWith("u1");
  });

  it("skips the refund sweep when no card was open", async () => {
    db.user.findUnique.mockResolvedValue(member({ profile: null }));
    db.suggestion.updateMany.mockResolvedValue({ count: 0 });
    const res = await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "x", now: NOW });
    expect(res).toMatchObject({ ok: true, closed: 0, refunded: 0 });
    expect(db.profile.update).not.toHaveBeenCalled();
    expect(mutual.refundUnansweredInterests).not.toHaveBeenCalled();
    expect(suggest.autoSuggestForUser).toHaveBeenCalledWith("u1");
  });

  it("refuses a member with any match, and changes nothing", async () => {
    db.user.findUnique.mockResolvedValue(member({ _count: { matchesAsFemale: 0, matchesAsMale: 1 } }));
    const res = await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "x" });
    expect(res).toEqual({ ok: false, error: "HAS_MATCH" });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(suggest.autoSuggestForUser).not.toHaveBeenCalled();
  });

  it("refuses the same gender, an admin account and an unknown user", async () => {
    db.user.findUnique.mockResolvedValueOnce(member());
    expect(await changeMemberGender({ userId: "u1", gender: "MALE", adminId: "a1", reason: "x" })).toEqual({ ok: false, error: "SAME_GENDER" });
    db.user.findUnique.mockResolvedValueOnce(member({ role: "ADMIN" }));
    expect(await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "x" })).toEqual({ ok: false, error: "NOT_MEMBER" });
    db.user.findUnique.mockResolvedValueOnce(null);
    expect(await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "x" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("still succeeds when the refund sweep fails (the morning job catches up)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.findUnique.mockResolvedValue(member());
    mutual.refundUnansweredInterests.mockRejectedValue(new Error("db"));
    const res = await changeMemberGender({ userId: "u1", gender: "FEMALE", adminId: "a1", reason: "x", now: NOW });
    expect(res).toMatchObject({ ok: true, closed: 4, refunded: 0 });
  });
});

describe("POST /api/admin/users/[id]/gender", () => {
  const call = (body: unknown) =>
    POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "u1" }) });

  it("needs an admin", async () => {
    auth.requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await call({ gender: "FEMALE", reason: "x" })).status).toBe(403);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("validates the gender and requires a reason", async () => {
    expect((await call({ gender: "OTHER", reason: "x" })).status).toBe(400);
    expect((await call({ gender: "FEMALE", reason: "  " })).status).toBe(400);
    expect((await call({ gender: "FEMALE", reason: "x".repeat(201) })).status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("answers 409 for a member with a match", async () => {
    db.user.findUnique.mockResolvedValue(member({ _count: { matchesAsFemale: 2, matchesAsMale: 0 } }));
    const res = await call({ gender: "FEMALE", reason: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("HAS_MATCH");
  });

  it("returns what was closed and refunded", async () => {
    db.user.findUnique.mockResolvedValue(member());
    const res = await call({ gender: "FEMALE", reason: " wrong at sign-up " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, closed: 4, refunded: 2 });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('admin=admin1 user=u1 MALE->FEMALE closed=4 reason="wrong at sign-up"'));
  });
});
