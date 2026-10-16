import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ mutualMatch: { findFirst: vi.fn(), count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { pageForMatch } from "@/lib/matches/focus";

describe("pageForMatch", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the page holding the match", async () => {
    db.mutualMatch.findFirst.mockResolvedValue({ id: "m12", createdAt: new Date("2026-01-01") });
    db.mutualMatch.count.mockResolvedValue(11); // 11 newer matches → 12th item → page 2 of 10
    expect(await pageForMatch("u1", "m12", 10)).toBe(2);
    db.mutualMatch.count.mockResolvedValue(9);
    expect(await pageForMatch("u1", "m12", 10)).toBe(1);
  });

  it("only looks at my matches", async () => {
    db.mutualMatch.findFirst.mockResolvedValue(null);
    expect(await pageForMatch("u1", "other", 10)).toBeNull();
    expect(db.mutualMatch.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "other",
      OR: [{ femaleId: "u1" }, { maleId: "u1" }],
    });
    expect(db.mutualMatch.count).not.toHaveBeenCalled();
  });
});
