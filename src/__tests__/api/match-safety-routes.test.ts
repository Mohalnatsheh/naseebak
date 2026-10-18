import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  block: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  introRequest: { updateMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  suggestion: { findMany: vi.fn() },
  message: { count: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(async () => []), update: vi.fn() },
  parentInfo: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ session: { user: { id: "u1" } } })),
}));
vi.mock("@/lib/settings", () => ({
  getCycleFlags: vi.fn(async () => ({ introRequests: true, chat: true, mutualSuggestions: true })),
}));
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingForUser: vi.fn(async () => {}) }));

import { GET as getPhotos } from "@/app/api/matches/[id]/photos/route";
import { GET as getMatches } from "@/app/api/matches/route";
import { POST as postBlock } from "@/app/api/blocks/route";
import { GET as getCounts } from "@/app/api/me/counts/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const active = { isDeactivated: false, status: "VERIFIED" };
const photoMatch = (female: object = {}) => ({
  id: "m1", femaleId: "f1", maleId: "u1",
  female: { id: "f1", ...active, photos: [{ id: "p1", url: "x", order: 0 }], ...female },
  male: { id: "u1", ...active, photos: [] },
});
const listMatch = (id: string, partnerId: string, partner: object = active) => ({
  id, femaleId: partnerId, maleId: "u1", suggestionId: null, photosRevealed: true, createdAt: new Date(),
  female: { id: partnerId, firstName: "هديل", isVerified: false, profile: null, ...partner },
  male: { id: "u1", firstName: "يزن", isVerified: false, profile: null, ...active },
  visitRequest: null, conversation: null, introRequests: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findMany.mockResolvedValue([]);
  db.introRequest.updateMany.mockResolvedValue({ count: 0 });
  db.suggestion.findMany.mockResolvedValue([]);
});

describe("GET /api/matches/[id]/photos", () => {
  /** Blocks as the two queries of loadMatchStates see them (who blocked me / whom I blocked) */
  const blocks = (rows: { blockerId: string; blockedId: string }[]) =>
    db.block.findMany.mockImplementation(async ({ where }: { where: { blockedId?: string; blockerId?: string; OR?: unknown } }) =>
      rows
        .filter((r) => (where.blockedId ? r.blockedId === where.blockedId : where.blockerId ? r.blockerId === where.blockerId : true))
        .map((r, i) => ({ id: `b${i}`, ...r }))
    );
  const stateRow = (over: object = {}, female: object = active) => ({
    ...listMatch("m1", "f1", female), femaleOutcome: null, maleOutcome: null, ...over,
  });

  it("returns the partner's photos for an open match", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(photoMatch());
    db.mutualMatch.findMany.mockResolvedValue([stateRow()]);
    const res = await getPhotos(new Request("http://x"), params("m1"));
    expect(res.status).toBe(200);
    expect((await res.json()).photos).toHaveLength(1);
  });

  it("refuses when I blocked them, and hides the match when they blocked me", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(photoMatch());
    db.mutualMatch.findMany.mockResolvedValue([stateRow()]);
    blocks([{ blockerId: "u1", blockedId: "f1" }]);
    expect((await getPhotos(new Request("http://x"), params("m1"))).status).toBe(403);
    blocks([{ blockerId: "f1", blockedId: "u1" }]);
    expect((await getPhotos(new Request("http://x"), params("m1"))).status).toBe(404);
  });

  it("refuses for a deactivated partner", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(photoMatch({ isDeactivated: true }));
    db.mutualMatch.findMany.mockResolvedValue([stateRow({}, { isDeactivated: true, status: "VERIFIED" })]);
    expect((await getPhotos(new Request("http://x"), params("m1"))).status).toBe(403);
  });

  it("locks the photos once someone said «لم يحصل نصيب»", async () => {
    db.mutualMatch.findUnique.mockResolvedValue(photoMatch());
    db.mutualMatch.findMany.mockResolvedValue([stateRow({ femaleOutcome: "NOT_A_MATCH" })]);
    expect((await getPhotos(new Request("http://x"), params("m1"))).status).toBe(403);
  });
});

describe("GET /api/matches", () => {
  it("hides matches with people who blocked me and returns closed cards for my blocks / inactive partners", async () => {
    db.block.findMany.mockImplementation(async ({ where }: { where: { blockedId?: string } }) =>
      where.blockedId === "u1" ? [{ blockerId: "f-blocker" }] : [{ id: "blk", blockedId: "f-blocked" }]
    );
    const rows = [listMatch("m1", "f-ok"), listMatch("m3", "f-blocked"), listMatch("m4", "f-off", { isDeactivated: true, status: "VERIFIED" })];
    db.mutualMatch.findMany.mockResolvedValue(rows);
    db.mutualMatch.count.mockResolvedValue(3);
    const res = await getMatches(new Request("http://x/api/matches?page=1"));
    const data = await res.json();

    const where = db.mutualMatch.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("f-blocker");
    const byId = Object.fromEntries(data.matches.map((m: { id: string }) => [m.id, m]));
    expect(byId.m1).toMatchObject({ closed: null, photosRevealed: true });
    expect(byId.m3).toMatchObject({ closed: "blocked", blockId: "blk", photosRevealed: false });
    expect(byId.m4).toMatchObject({ closed: "inactive", photosRevealed: false });
  });

  it("an ended match («لم يحصل نصيب») keeps only name, age and city", async () => {
    const profile = { dateOfBirth: new Date("1995-01-01"), city: "عمان", job: "مهندسة", aboutMe: "نبذة", childrenCount: 0 };
    const row = { ...listMatch("m1", "f1", { ...active, profile }), femaleOutcome: "NOT_A_MATCH", maleOutcome: null };
    db.mutualMatch.findMany.mockResolvedValue([row]);
    db.mutualMatch.count.mockResolvedValue(1);
    const data = await (await getMatches(new Request("http://x/api/matches?page=1"))).json();
    const m = data.matches[0];
    expect(m).toMatchObject({ closed: "ended", photosRevealed: false });
    expect(m.partner).toMatchObject({ firstName: "هديل", city: "عمان", job: null, aboutMe: null });
    expect(m.partner.age).toBeGreaterThan(18);
  });
});

describe("POST /api/blocks", () => {
  const req = (body: unknown) =>
    new Request("http://x/api/blocks", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

  it("blocks and cancels pending requests between the two", async () => {
    db.user.findUnique.mockResolvedValue({ id: "f1" });
    db.block.findUnique.mockResolvedValue(null);
    db.block.create.mockResolvedValue({ id: "b1" });
    const res = await postBlock(req({ blockedId: "f1" }));
    expect(res.status).toBe(200);
    expect(db.introRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
      data: { status: "CANCELLED" },
    }));
  });

  it("validates the body and refuses self-blocks", async () => {
    expect((await postBlock(req({}))).status).toBe(400);
    expect((await postBlock(req({ blockedId: "u1" }))).status).toBe(400);
  });
});

describe("GET /api/me/counts", () => {
  it("counts only matches with an available action and cancels dead pending requests", async () => {
    db.introRequest.count.mockResolvedValue(0);
    db.introRequest.findFirst.mockResolvedValue(null);
    db.message.count.mockResolvedValue(0);
    db.conversation.count.mockResolvedValue(0);
    db.parentInfo.findUnique.mockResolvedValue(null);
    db.mutualMatch.findMany.mockResolvedValue([
      listMatch("m1", "f-ok"),
      { ...listMatch("m2", "f-done"), introRequests: [
        { type: "FAMILY", status: "DECLINED", expiresAt: new Date() },
        { type: "CHAT", status: "DECLINED", expiresAt: new Date() },
      ] },
      listMatch("m3", "f-off", { isDeactivated: true, status: "VERIFIED" }),
    ]);
    const data = await (await getCounts()).json();
    expect(data.actionableMatches).toBe(1);
    expect(db.introRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED" } }));
  });
});
