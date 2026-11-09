import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })),
  autoSuggestWithReason: vi.fn(),
  countNewItems: vi.fn(),
  db: { user: { findUnique: vi.fn(async () => ({ matchCredits: 3 })) } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestWithReason: m.autoSuggestWithReason }));
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getCycleFlags: vi.fn(async () => ({ mutualSuggestions: true, creditOnInterest: true, chat: true })) }));
vi.mock("@/lib/suggestions/feed", () => ({ countNewItems: m.countNewItems, hasOpenMutual: vi.fn(), suggestionOrder: vi.fn() }));

import { GET } from "@/app/api/suggestions/route";

beforeEach(() => {
  m.autoSuggestWithReason.mockResolvedValue({ reason: "no_candidates", nextSuggestionsAt: null });
});

describe("GET /api/suggestions emptyReason (QA cycle WC-16)", () => {
  it("is null while there are cards to show", async () => {
    m.countNewItems.mockResolvedValue(2);
    const body = await (await GET(new Request("http://x/api/suggestions"))).json();
    expect(body.total).toBe(2);
    expect(body.emptyReason).toBeNull();
  });

  it("says why when nothing is left", async () => {
    m.countNewItems.mockResolvedValue(0);
    const body = await (await GET(new Request("http://x/api/suggestions"))).json();
    expect(body.emptyReason).toBe("no_candidates");
  });
});
