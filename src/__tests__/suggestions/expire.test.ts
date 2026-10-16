import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ suggestion: { updateMany: vi.fn(), findMany: vi.fn() } }));
const settings = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/matching/auto-suggest", () => auto);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));

import { expireMutualSuggestions } from "@/lib/suggestions/mutual";

beforeEach(() => {
  vi.clearAllMocks();
  db.suggestion.updateMany.mockResolvedValue({ count: 2 });
  db.suggestion.findMany.mockResolvedValue([
    { recipientId: "u1", candidateId: "f1" },
    { recipientId: "u1", candidateId: "f2" },
  ]);
  auto.autoSuggestForUser.mockResolvedValue(0);
});

describe("expireMutualSuggestions", () => {
  it("tops up both sides when it expired rows (flag on)", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    await expireMutualSuggestions("u1");
    await vi.waitFor(() => expect(auto.autoSuggestForUser).toHaveBeenCalledTimes(3));
    expect(auto.autoSuggestForUser.mock.calls.map((c) => c[0]).sort()).toEqual(["f1", "f2", "u1"]);
  });

  it("does nothing extra when the flag is off or nothing expired", async () => {
    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: false });
    await expireMutualSuggestions("u1");
    expect(db.suggestion.findMany).not.toHaveBeenCalled();

    settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
    db.suggestion.updateMany.mockResolvedValue({ count: 0 });
    await expireMutualSuggestions("u1");
    await new Promise((r) => setTimeout(r, 10));
    expect(auto.autoSuggestForUser).not.toHaveBeenCalled();
  });
});
