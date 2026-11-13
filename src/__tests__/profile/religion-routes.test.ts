import { describe, it, expect, vi, beforeEach } from "vitest";

const member = vi.hoisted(() => ({ country: "JO", religion: null as string | null }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(async () => ({ country: member.country, profile: { religion: member.religion } })) },
  profile: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/suggestions/dealbreaker-sweep", () => ({ closeSuggestionsBreakingDealbreakers: vi.fn(async () => undefined) }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestForUser: vi.fn(async () => undefined), clearSuggestCooldown: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getReligionEnabled: vi.fn(async () => false) }));

import { PUT } from "@/app/api/profile/dealbreakers/route";

const put = (keys: string[]) =>
  PUT(new Request("http://x/api/profile/dealbreakers", { method: "PUT", body: JSON.stringify({ keys }) }));

beforeEach(() => {
  vi.clearAllMocks();
  member.country = "JO";
  member.religion = null;
});

describe("PUT /api/profile/dealbreakers: «الديانة»", () => {
  it("drops the hijab, beard and sect conditions for a Christian", async () => {
    member.religion = "مسيحي";
    member.country = "LB";
    const res = await put(["age", "hijab", "beard", "sect"]);
    expect(res.status).toBe(200);
    expect(db.profile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { dealbreakers: ["age"] } });
    expect((await res.json()).keys).toEqual(["age"]);
  });

  it("keeps them for a Muslim (stored or null)", async () => {
    for (const religion of ["مسلم", null]) {
      vi.clearAllMocks();
      member.religion = religion;
      const res = await put(["age", "hijab", "beard"]);
      expect(res.status).toBe(200);
      expect(db.profile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { dealbreakers: ["age", "hijab", "beard"] } });
    }
  });
});
