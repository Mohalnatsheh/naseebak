import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ suggestion: { create: vi.fn() }, user: { findUnique: vi.fn() } }));
const flags = vi.hoisted(() => ({ value: { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true } }));
const counts = vi.hoisted(() => ({ openSuggestionCount: vi.fn(), MAX_OPEN_SUGGESTIONS: 5 }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => flags.value) }));
vi.mock("@/lib/matching/auto-suggest", () => counts);
vi.mock("@/lib/admin/suggestion-pair", () => ({ checkSuggestionPair: vi.fn(async () => null) }));
vi.mock("@/lib/notify", () => ({ notifyMany: vi.fn() }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1" } } })) }));

import { POST } from "@/app/api/admin/suggestions/route";

const pick = (score?: number) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ recipientId: "u1", candidateId: "f1", compatibilityScore: score ?? 20 }) }));

beforeEach(() => {
  vi.clearAllMocks();
  flags.value = { ...flags.value, creditOnInterest: true };
  db.suggestion.create.mockResolvedValue({ id: "s1" });
});

describe("admin hand-picked suggestion", () => {
  it("is refused when either person already holds 5 open suggestions", async () => {
    counts.openSuggestionCount.mockImplementation(async (id: string) => (id === "f1" ? 5 : 1));
    const res = (await pick())!;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/candidate/);
    expect(db.suggestion.create).not.toHaveBeenCalled();
  });

  it("may still use a score under the automatic minimum", async () => {
    counts.openSuggestionCount.mockResolvedValue(2);
    const res = (await pick(20))!;
    expect(res.status).toBe(200);
    expect(db.suggestion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ compatibilityScore: 20, flow: "MUTUAL" }) });
  });

  it("no cap check without credit on interest", async () => {
    flags.value = { ...flags.value, creditOnInterest: false };
    await pick();
    expect(counts.openSuggestionCount).not.toHaveBeenCalled();
    expect(db.suggestion.create).toHaveBeenCalled();
  });
});
