import { describe, it, expect, vi, beforeEach } from "vitest";

const member = vi.hoisted(() => ({ country: "JO" }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(async () => ({ country: member.country })) },
  profile: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })) }));
vi.mock("@/lib/suggestions/dealbreaker-sweep", () => ({ closeSuggestionsBreakingDealbreakers: vi.fn(async () => undefined) }));
vi.mock("@/lib/matching/auto-suggest", () => ({ autoSuggestForUser: vi.fn(async () => undefined), clearSuggestCooldown: vi.fn() }));

import { PUT } from "@/app/api/profile/dealbreakers/route";
import { toFeedCandidate } from "@/lib/suggestions/feed";

const put = (keys: string[]) =>
  PUT(new Request("http://x/api/profile/dealbreakers", { method: "PUT", body: JSON.stringify({ keys }) }));

beforeEach(() => {
  vi.clearAllMocks();
  member.country = "JO";
});

describe("PUT /api/profile/dealbreakers: the «المذهب» condition", () => {
  it("is kept for a Lebanese member", async () => {
    member.country = "LB";
    const res = await put(["age", "sect"]);
    expect(res.status).toBe(200);
    expect(db.profile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { dealbreakers: ["age", "sect"] } });
    expect((await res.json()).keys).toEqual(["age", "sect"]);
  });

  it("is dropped for a Jordanian member", async () => {
    const res = await put(["age", "sect"]);
    expect(res.status).toBe(200);
    expect(db.profile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { dealbreakers: ["age"] } });
    expect((await res.json()).keys).toEqual(["age"]);
  });
});

describe("cards", () => {
  const person = (sect: string | null) => ({
    id: "p", firstName: "س", isVerified: false, gender: "FEMALE", personalityResult: null,
    profile: { sect, prefSect: ["سني"], dealbreakers: ["sect"] },
  });

  it("show a stated sect and hide «أفضّل عدم الذكر»; never the preferences", () => {
    expect(toFeedCandidate(person("سني")).sect).toBe("سني");
    expect(toFeedCandidate(person("أفضّل عدم الذكر")).sect).toBeNull();
    expect(toFeedCandidate(person(null)).sect).toBeNull();
    expect(toFeedCandidate(person("سني"))).not.toHaveProperty("prefSect");
    expect(toFeedCandidate(person("سني"))).not.toHaveProperty("dealbreakers");
  });
});
