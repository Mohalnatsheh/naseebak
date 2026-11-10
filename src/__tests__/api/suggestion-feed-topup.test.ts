import { describe, it, expect, vi, beforeEach } from "vitest";

/* GET /api/suggestions/feed?topup=1 (QA WM-07): the page-open top-up in the same request, additive */

const m = vi.hoisted(() => ({
  order: [] as string[],
  feed: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/lib/activity", () => ({ touchLastActive: async () => void m.order.push("active") }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: async () => void m.order.push("day") }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestWithReason: (...a: unknown[]) => m.run(...a) }));
vi.mock("@/lib/suggestions/feed", () => ({ getSuggestionFeed: (...a: unknown[]) => m.feed(...a) }));

import { GET } from "@/app/api/suggestions/feed/route";

beforeEach(() => {
  m.order = [];
  m.run.mockReset().mockImplementation(async () => {
    m.order.push("topup");
    return { reason: "no_candidates", nextSuggestionsAt: null };
  });
  m.feed.mockReset().mockImplementation(async () => {
    m.order.push("feed");
    return { items: [], page: 1, totalPages: 0, total: 0 };
  });
});

const get = (q: string) => GET(new Request(`http://x/api/suggestions/feed?${q}`));

describe("feed top-up", () => {
  it("without topup: only the feed, as before (old app builds)", async () => {
    const body = await (await get("tab=new&page=1")).json();
    expect(m.order).toEqual(["feed"]);
    expect(body).not.toHaveProperty("emptyReason");
  });

  it("topup=1: active, top-up, then the feed; why «جديدة» is empty", async () => {
    const body = await (await get("tab=new&page=1&topup=1")).json();
    expect(m.order).toEqual(["active", "day", "topup", "feed"]);
    expect(m.run).toHaveBeenCalledWith("u1");
    expect(body.emptyReason).toBe("no_candidates");
  });

  it("no reason next to open cards, nor for another tab", async () => {
    m.feed.mockImplementation(async () => ({ items: [], page: 1, totalPages: 1, total: 3 }));
    expect((await (await get("tab=new&page=1&count=1&topup=1")).json()).emptyReason).toBeNull();
    m.feed.mockImplementation(async () => ({ items: [], page: 1, totalPages: 0, total: 0 }));
    expect((await (await get("tab=waiting&page=1&topup=1")).json()).emptyReason).toBeNull();
  });

  it("a failed top-up still answers the feed", async () => {
    m.run.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get("tab=new&page=1&topup=1");
    expect(res.status).toBe(200);
    expect((await res.json()).emptyReason).toBeNull();
  });
});
