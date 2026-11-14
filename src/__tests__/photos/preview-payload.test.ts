import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `photoPreview` on pre-match payloads: the shared helper, the setting, and the suggestion feed (every tab), which
 * feeds the website cards, the candidate full profile and the app's home blocks.
 */
const db = vi.hoisted(() => ({
  suggestion: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  user: { findUnique: vi.fn() },
  block: { findMany: vi.fn() },
  like: { findMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/pro/status", () => ({ proUserIds: vi.fn(async () => new Set<string>()) }));
const sw = vi.hoisted(() => ({ preview: "true" as "true" | "false" | "throw" }));
const settings = vi.hoisted(() => ({
  getCycleFlags: vi.fn(),
  getReligionEnabled: vi.fn(),
  getPhotoBlurPreview: vi.fn(async () => {
    if (sw.preview === "throw") throw new Error("settings down");
    return sw.preview === "true";
  }),
}));
vi.mock("@/lib/settings", () => settings);

import { photoPreviewEnabled, previewSelect, withPhotoPreview } from "@/lib/photos/preview-payload";
import { getSuggestionFeed, type OpenFeedItem } from "@/lib/suggestions/feed";

const PREVIEW = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
const OTHER = "data:image/webp;base64,AAAA";
const DAY = 24 * 60 * 60 * 1000;
type P = { isPrimary: boolean; order: number; blurPreview: string | null; url?: string };
const person = (id: string, gender: "MALE" | "FEMALE", photos: P[] = []) => ({
  id, firstName: id, isVerified: false, gender, personalityResult: null,
  profile: { city: "عمان", dateOfBirth: new Date("1995-01-01") },
  photos,
});
const me = { ...person("me", "MALE"), matchCredits: 3 };
const withPhoto = person("f1", "FEMALE", [
  { isPrimary: false, order: 0, blurPreview: OTHER, url: "https://cdn.example/a.webp" },
  { isPrimary: true, order: 1, blurPreview: PREVIEW, url: "https://cdn.example/b.webp" },
]);
const noPhoto = person("f2", "FEMALE");
const mutualRow = (id: string, other: ReturnType<typeof person>, extra: object = {}) => ({
  id, compatibilityScore: 70, createdAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY),
  recipientId: other.id, recipient: other, candidate: me, recipientDecision: null, candidateDecision: null, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  sw.preview = "true";
  settings.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true });
  settings.getReligionEnabled.mockResolvedValue(false);
  db.user.findUnique.mockResolvedValue(me);
  db.block.findMany.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.groupBy.mockResolvedValue([]);
  db.like.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
});

describe("withPhotoPreview", () => {
  it("adds the primary photo's preview, else the lowest order's", () => {
    expect(withPhotoPreview({ id: "a" }, withPhoto.photos, true)).toEqual({ id: "a", photoPreview: PREVIEW });
    const noPrimary = [{ isPrimary: false, order: 2, blurPreview: OTHER }, { isPrimary: false, order: 1, blurPreview: PREVIEW }];
    expect(withPhotoPreview({ id: "a" }, noPrimary, true).photoPreview).toBe(PREVIEW);
  });

  it("null without photos, without a preview yet, or with the setting off", () => {
    expect(withPhotoPreview({ id: "a" }, [], true).photoPreview).toBeNull();
    expect(withPhotoPreview({ id: "a" }, undefined, true).photoPreview).toBeNull();
    expect(withPhotoPreview({ id: "a" }, [{ isPrimary: true, order: 0, blurPreview: null }], true).photoPreview).toBeNull();
    expect(withPhotoPreview({ id: "a" }, withPhoto.photos, false).photoPreview).toBeNull();
  });

  it("never passes on anything but a small WebP data URI (a url stored by mistake, an oversized copy)", () => {
    const bad = (blurPreview: string) => withPhotoPreview({}, [{ isPrimary: true, order: 0, blurPreview }], true).photoPreview;
    expect(bad("https://cdn.example/a.webp")).toBeNull();
    expect(bad("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(bad("data:image/webp;base64," + "A".repeat(2000))).toBeNull();
  });

  it("previewSelect reads only the three fields the helper needs (no url)", () => {
    expect(previewSelect).toEqual({ photos: { select: { isPrimary: true, order: true, blurPreview: true } } });
  });
});

describe("photoPreviewEnabled", () => {
  it("follows the setting; a failed read stays on (the default)", async () => {
    expect(await photoPreviewEnabled()).toBe(true);
    sw.preview = "false";
    expect(await photoPreviewEnabled()).toBe(false);
    sw.preview = "throw";
    expect(await photoPreviewEnabled()).toBe(true);
  });
});

describe("getSuggestionFeed: photoPreview", () => {
  const feedOf = async (tab: "new" | "interested" | "waiting") => (await getSuggestionFeed("me", tab, 1)).items as OpenFeedItem[];

  it.each(["new", "interested", "waiting"] as const)("«%s»: the preview, or null without photos", async (tab) => {
    const extra = tab === "interested" ? { recipientDecision: "INTERESTED" } : tab === "waiting" ? { candidateDecision: "INTERESTED" } : {};
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1", withPhoto, extra), mutualRow("s2", noPhoto, extra)]);
    const items = await feedOf(tab);
    const byId = new Map(items.map((i) => [i.candidate.id, i.candidate.photoPreview]));
    expect(byId.get("f1")).toBe(PREVIEW);
    expect(byId.get("f2")).toBeNull();
  });

  it("reads the photos in the card query itself (no extra round trip per card), for the other person only", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1", withPhoto)]);
    await feedOf("new");
    const select = db.suggestion.findMany.mock.calls[0][0].select;
    expect(select.recipient.select.photos).toEqual(previewSelect.photos);
    expect(select.candidate.select.photos).toEqual(previewSelect.photos);
    // the viewer's own row never loads photos
    expect(db.user.findUnique.mock.calls[0][0].select.photos).toBeUndefined();
    // the count-only read never loads them either
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(me);
    db.suggestion.findMany.mockResolvedValue([]);
    await getSuggestionFeed("me", "new", 1, 10, { countOnly: true });
    expect(db.suggestion.findMany.mock.calls[0][0].select.recipient.select.photos).toBeUndefined();
  });

  it("setting off: every card says null", async () => {
    sw.preview = "false";
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1", withPhoto)]);
    const [item] = await feedOf("new");
    expect(item.candidate.photoPreview).toBeNull();
  });

  it("guard: a card never carries a photo url, a `photos` key or any http string", async () => {
    db.suggestion.findMany.mockResolvedValueOnce([mutualRow("s1", withPhoto)]);
    const items = await feedOf("new");
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/"url"|"photos"|"photoUrl"|"avatarUrl"/);
    expect(json).not.toMatch(/"https?:/);
    expect(json).not.toContain("cdn.example");
  });
});
