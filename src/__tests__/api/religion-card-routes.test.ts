import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level checks of «الديانة» on the card routes: `religion` is null with the switch off, a Christian's
 * Muslim-only answers (hijab, niqab, beard, sect) are masked whatever the switch says, and a closed match still
 * blanks its details.
 */
const sw = vi.hoisted(() => ({ religion: "false" as "true" | "false" | "throw" }));
const states = vi.hoisted(() => ({ map: new Map<string, { closed: string | null; actionable: boolean }>() }));
const db = vi.hoisted(() => ({
  block: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  suggestion: { findMany: vi.fn(), count: vi.fn() },
  mutualMatch: { findMany: vi.fn(), count: vi.fn() },
  like: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ session: { user: { id: "me" } } })) }));
vi.mock("@/lib/activity", () => ({ touchLastActive: vi.fn() }));
vi.mock("@/lib/activity-days", () => ({ recordActivityDay: vi.fn() }));
vi.mock("@/lib/matching/auto-suggest", () => ({
  autoSuggestWithReason: vi.fn(async () => ({ reason: null, nextSuggestionsAt: null })),
}));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ mutualSuggestions: false, creditOnInterest: false, chat: false })),
  getReligionEnabled: vi.fn(async () => {
    if (sw.religion === "throw") throw new Error("settings down");
    return sw.religion === "true";
  }),
}));
vi.mock("@/lib/suggestions/feed", () => ({
  countNewItems: vi.fn(),
  hasOpenMutual: vi.fn(async () => false),
  suggestionOrder: vi.fn(() => ({ createdAt: "desc" })),
}));
vi.mock("@/lib/matches/focus", () => ({
  MATCHES_ORDER: { createdAt: "desc" },
  pageForMatch: vi.fn(async () => null),
  visibleMatchesWhere: vi.fn(() => ({})),
}));
vi.mock("@/lib/matches/state", () => ({
  hiddenPartnerIds: vi.fn(async () => []),
  loadMatchStates: vi.fn(async () => states.map),
}));
vi.mock("@/lib/pro/status", () => ({ proUserIds: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/matches/next-step", () => ({ matchNextStep: vi.fn(() => null) }));

import { GET as suggestionsGET } from "@/app/api/suggestions/route";
import { GET as matchesGET } from "@/app/api/matches/route";
import { GET as receivedGET } from "@/app/api/interests/received/route";

const christian = {
  dateOfBirth: new Date("1995-01-01"), city: "بيروت", religiosity: "ملتزم",
  religion: "مسيحي", hijab: false, niqab: false, beard: null, sect: "سني",
};
const muslim = {
  dateOfBirth: new Date("1995-01-01"), city: "عمان", religiosity: "ملتزم",
  religion: null, hijab: true, niqab: false, beard: null, sect: null,
};
const person = (id: string, profile: object) => ({ id, firstName: "A", isVerified: false, profile });

const req = (path: string) => new Request(`http://x${path}`);
async function cards(route: "suggestions" | "matches" | "received") {
  if (route === "suggestions") return (await (await suggestionsGET(req("/api/suggestions"))).json()).suggestions.map((s: { candidate: object }) => s.candidate);
  if (route === "matches") return (await (await matchesGET(req("/api/matches"))).json()).matches.map((m: { partner: object }) => m.partner);
  return (await (await receivedGET(req("/api/interests/received"))).json()).interests.map((i: { candidate: object }) => i.candidate);
}

beforeEach(() => {
  vi.clearAllMocks();
  sw.religion = "false";
  states.map = new Map();
  db.block.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ matchCredits: 3 });
  const people = [person("c1", christian), person("m1", muslim)];
  db.suggestion.findMany.mockResolvedValue(
    people.map((p, i) => ({ id: `s${i}`, compatibilityScore: 70, source: "AUTO", createdAt: new Date(), candidate: p })),
  );
  db.suggestion.count.mockResolvedValue(2);
  db.mutualMatch.findMany.mockResolvedValue(
    people.map((p, i) => ({
      id: `mm${i}`, femaleId: p.id, maleId: "me", female: p, male: person("me", muslim), suggestionId: null,
      photosRevealed: true, createdAt: new Date(), visitRequest: null, introRequests: [], conversation: null,
    })),
  );
  db.mutualMatch.count.mockResolvedValue(2);
  db.like.findMany.mockImplementation(async (args: { where?: { toUserId?: string } }) =>
    args?.where?.toUserId
      ? people.map((p, i) => ({ id: `l${i}`, suggestionId: null, createdAt: new Date(), fromUser: p }))
      : [],
  );
  db.like.count.mockResolvedValue(2);
});

describe.each(["suggestions", "matches", "received"] as const)("GET %s: «الديانة»", (route) => {
  it("switch off: religion is null; a Christian's Muslim-only answers stay masked; a Muslim's show", async () => {
    const [c, m] = await cards(route);
    expect(c.religion).toBeNull();
    expect(c).toMatchObject({ hijab: null, niqab: null, beard: null, sect: null });
    expect(m.religion).toBeNull();
    expect(m.hijab).toBe(true);
  });

  it("a failed switch read reads as off", async () => {
    sw.religion = "throw";
    const [c, m] = await cards(route);
    expect(c.religion).toBeNull();
    expect(m.religion).toBeNull();
  });

  it("switch on: religion is sent (null reads «مسلم») and the Christian stays masked", async () => {
    sw.religion = "true";
    const [c, m] = await cards(route);
    expect(c.religion).toBe("مسيحي");
    expect(c).toMatchObject({ hijab: null, niqab: null, beard: null, sect: null });
    expect(m.religion).toBe("مسلم");
    expect(m.hijab).toBe(true);
  });
});

describe("GET /api/matches: closed cards", () => {
  it("detail() still blanks religion and the religious answers of a closed match", async () => {
    sw.religion = "true";
    states.map = new Map([
      ["mm0", { closed: "ended", actionable: false }],
      ["mm1", { closed: "blocked", actionable: false }],
    ]);
    const partners = await cards("matches");
    for (const p of partners) {
      expect(p).toMatchObject({ religion: null, hijab: null, niqab: null, beard: null, sect: null, religiosity: null });
      expect(p.city).not.toBeNull();
    }
  });
});
