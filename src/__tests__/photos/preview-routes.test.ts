import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `photoPreview` on the older (legacy-flow) card routes, and never on a match payload. The shared-flow feed is
 * covered in preview-payload.test.ts.
 */
const sw = vi.hoisted(() => ({ preview: true }));
const db = vi.hoisted(() => ({
  block: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  suggestion: { findMany: vi.fn(), count: vi.fn() },
  mutualMatch: { findMany: vi.fn(), count: vi.fn() },
  like: { findMany: vi.fn(), count: vi.fn() },
  notification: { findMany: vi.fn() },
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
  getReligionEnabled: vi.fn(async () => false),
  getPhotoBlurPreview: vi.fn(async () => sw.preview),
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
  loadMatchStates: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/pro/status", () => ({ proUserIds: vi.fn(async () => new Set<string>()) }));
vi.mock("@/lib/matches/next-step", () => ({ matchNextStep: vi.fn(() => null) }));

import { GET as suggestionsGET } from "@/app/api/suggestions/route";
import { GET as receivedGET } from "@/app/api/interests/received/route";
import { GET as sentGET } from "@/app/api/suggestions/sent/route";
import { GET as matchesGET } from "@/app/api/matches/route";

const PREVIEW = "data:image/webp;base64,UklGRiQAAABXRUJQ";
const profile = { dateOfBirth: new Date("1995-01-01"), city: "عمان", religiosity: "ملتزم", hijab: true, niqab: false };
const photos = [{ isPrimary: true, order: 0, blurPreview: PREVIEW, url: "https://cdn.example/a.webp" }];
const withPhoto = { id: "p1", firstName: "A", isVerified: false, profile, photos };
const noPhoto = { id: "p2", firstName: "B", isVerified: false, profile, photos: [] };
const people = [withPhoto, noPhoto];
const req = (path: string) => new Request(`http://x${path}`);

async function cards(route: "suggestions" | "received" | "sent") {
  if (route === "suggestions") return (await (await suggestionsGET(req("/api/suggestions"))).json()).suggestions.map((s: { candidate: object }) => s.candidate);
  if (route === "received") return (await (await receivedGET(req("/api/interests/received"))).json()).interests.map((i: { candidate: object }) => i.candidate);
  return (await (await sentGET(req("/api/suggestions/sent"))).json()).sentRequests.map((s: { candidate: object }) => s.candidate);
}

beforeEach(() => {
  vi.clearAllMocks();
  sw.preview = true;
  db.block.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ matchCredits: 3 });
  db.suggestion.findMany.mockImplementation(async (args: { include?: unknown }) =>
    args?.include
      ? people.map((p, i) => ({ id: `s${i}`, candidateId: p.id, compatibilityScore: 70, source: "AUTO", createdAt: new Date(), updatedAt: new Date(), candidate: p }))
      : [],
  );
  db.suggestion.count.mockResolvedValue(2);
  db.notification.findMany.mockResolvedValue([]);
  db.like.findMany.mockImplementation(async (args: { where?: { toUserId?: string } }) =>
    args?.where?.toUserId ? people.map((p, i) => ({ id: `l${i}`, suggestionId: null, createdAt: new Date(), fromUser: p })) : [],
  );
  db.like.count.mockResolvedValue(2);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.mutualMatch.count.mockResolvedValue(0);
});

describe.each(["suggestions", "received", "sent"] as const)("GET %s: photoPreview", (route) => {
  it("the preview for a member with photos, null without", async () => {
    const [a, b] = await cards(route);
    expect(a.photoPreview).toBe(PREVIEW);
    expect(b.photoPreview).toBeNull();
  });

  it("setting off: null", async () => {
    sw.preview = false;
    const [a] = await cards(route);
    expect(a.photoPreview).toBeNull();
  });

  it("guard: no photo url or photos list reaches the card", async () => {
    const json = JSON.stringify(await cards(route));
    expect(json).not.toMatch(/"url"|"photos"/);
    expect(json).not.toMatch(/"https?:/);
  });

  it("loads the preview fields only (never the url) in the card query", async () => {
    await cards(route);
    const call = route === "received" ? db.like.findMany.mock.calls.find((c) => c[0]?.include) : db.suggestion.findMany.mock.calls.find((c) => c[0]?.include);
    const sel = route === "received" ? call![0].include.fromUser.select : call![0].include.candidate.select;
    expect(sel.photos).toEqual({ select: { isPrimary: true, order: true, blurPreview: true } });
  });
});

describe("GET /api/suggestions/sent: a matched card", () => {
  it("carries no preview once matched", async () => {
    db.mutualMatch.findMany.mockResolvedValue([{ femaleId: "p1", maleId: "me" }]);
    const res = await (await sentGET(req("/api/suggestions/sent"))).json();
    const matched = res.sentRequests.find((s: { status: string }) => s.status === "matched");
    expect(matched).toBeDefined();
    expect("photoPreview" in matched.candidate).toBe(false);
  });
});

describe("GET /api/matches: never a preview", () => {
  it("match payloads carry no photoPreview", async () => {
    const me = { id: "me", firstName: "M", isVerified: false, profile };
    db.mutualMatch.findMany.mockResolvedValue([
      { id: "mm0", femaleId: "p1", maleId: "me", female: withPhoto, male: me, suggestionId: null, photosRevealed: true, createdAt: new Date(), visitRequest: null, introRequests: [], conversation: null },
    ]);
    db.mutualMatch.count.mockResolvedValue(1);
    const json = JSON.stringify(await (await matchesGET(req("/api/matches"))).json());
    expect(json).not.toContain("photoPreview");
    expect(json).not.toContain(PREVIEW);
  });
});
