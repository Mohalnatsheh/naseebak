import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  suggestion: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
  notification: { findFirst: vi.fn() },
}));
const score = vi.hoisted(() => ({ value: 80 }));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn() }));
const status = vi.hoisted(() => ({ memberSuggestStatus: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/admin/members-suggest-reason", () => status);
vi.mock("@/lib/settings", () => ({ getCycleFlags: async () => ({ creditOnInterest: true, introRequests: true, mutualSuggestions: true }) }));
vi.mock("@/lib/intro/followup", () => ({ NOT_ENGAGED: {} }));
vi.mock("@/lib/profile-completeness", () => ({ meetsSuggestionGate: () => true }));
vi.mock("@/lib/test-accounts", () => ({ isTestPhone: () => false, testPhones: () => [] }));
vi.mock("@/lib/matching/auto-suggest", () => ({ minSuggestionScore: () => 60, pairAvailability: () => new Map(), scoringSelect: { id: true } }));
vi.mock("@/lib/matching/score", async (orig) => {
  const real = await orig<typeof import("@/lib/matching/score")>();
  return { ...real, calculateCompatibility: () => score.value };
});

import { filterTip, filterTipText } from "@/lib/matching/filter-tip";
import { sendFilterTips, FILTER_TIP_TITLE } from "@/lib/cron/filter-tips";

const me = {
  id: "me", gender: "MALE", country: "JO", phone: "x",
  profile: { dealbreakers: ["age", "smokingStatus"], prefAgeMin: 20, prefAgeMax: 25, prefSmokingStatus: ["NON_SMOKER"] },
};
const woman = (id: string, born: string, smoking = "NON_SMOKER") => ({ id, gender: "FEMALE", profile: { dateOfBirth: new Date(born), smokingStatus: smoking, dealbreakers: [] } });

beforeEach(() => {
  vi.clearAllMocks();
  score.value = 80;
  db.user.findUnique.mockResolvedValue(me);
  db.suggestion.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
});

describe("filterTip", () => {
  it("names the filter that brings the most people; someone failing two filters doesn't count for either", async () => {
    db.user.findMany.mockResolvedValue([
      woman("too-old-1", "1985-01-01"), woman("too-old-2", "1985-01-01"), woman("too-old-3", "1985-01-01"), woman("too-old-4", "1985-01-01"),
      woman("smoker-1", "2003-01-01", "SMOKER"), woman("smoker-2", "2003-01-01", "SMOKER"), woman("smoker-3", "2003-01-01", "SMOKER"),
      woman("both", "1985-01-01", "SMOKER"),
      woman("fits", "2003-01-01"),
    ]);
    expect(await filterTip("me")).toEqual({ key: "age", gain: 4 });
  });

  it("nothing to say: no filters, a tiny gain, or the score would stop them anyway", async () => {
    db.user.findUnique.mockResolvedValueOnce({ ...me, profile: { ...me.profile, dealbreakers: [] } });
    expect(await filterTip("me")).toBeNull();
    db.user.findMany.mockResolvedValue([woman("a", "1985-01-01"), woman("b", "1985-01-01")]);
    expect(await filterTip("me")).toBeNull();
    db.user.findMany.mockResolvedValue([1, 2, 3, 4].map((n) => woman(`old-${n}`, "1985-01-01")));
    score.value = 50;
    expect(await filterTip("me")).toBeNull();
  });

  it("reads right in Arabic for both genders and for small and large numbers", () => {
    expect(filterTipText({ key: "age", gain: 12 }, false)).toBe("لو خففت شرط «العمر» يظهر لك 12 شخصاً مناسباً.");
    expect(filterTipText({ key: "city", gain: 5 }, true)).toBe("لو خففتِ شرط «المدينة» يظهر لكِ 5 أشخاص مناسبين.");
  });
});

describe("sendFilterTips", () => {
  const now = new Date("2026-11-05T15:00:00Z");

  it("asks only for active members with filters who weren't told in 7 days; push + bell, opens «جديدة»", async () => {
    db.user.findMany.mockResolvedValueOnce([{ id: "me", gender: "MALE" }]);
    status.memberSuggestStatus.mockResolvedValue({ reason: "no_candidates" });
    db.user.findMany.mockResolvedValue([1, 2, 3].map((n) => woman(`old-${n}`, "1985-01-01")));
    expect(await sendFilterTips(now)).toEqual({ members: 1, sent: 1 });
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.profile).toMatchObject({ isComplete: true, dealbreakers: { isEmpty: false } });
    expect(where.notifications.none).toMatchObject({ title: FILTER_TIP_TITLE, createdAt: { gte: new Date("2026-10-29T15:00:00Z") } });
    expect(notifyMod.notify.mock.calls[0][0]).toMatchObject({ userId: "me", sms: false, url: "/dashboard/suggestions?tab=new", title: FILTER_TIP_TITLE });
  });

  it("members with cards, or stopped for another reason, get nothing", async () => {
    db.user.findMany.mockResolvedValueOnce([{ id: "a", gender: "MALE" }, { id: "b", gender: "FEMALE" }]);
    status.memberSuggestStatus.mockResolvedValueOnce({ reason: null }).mockResolvedValueOnce({ reason: "weekly_cap" });
    expect(await sendFilterTips(now)).toEqual({ members: 2, sent: 0 });
    expect(notifyMod.notify).not.toHaveBeenCalled();
  });
});
