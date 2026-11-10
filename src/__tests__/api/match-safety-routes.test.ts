import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  mutualMatch: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  block: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  introRequest: { updateMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  suggestion: { findMany: vi.fn(), count: vi.fn() },
  message: { count: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(async () => []), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 0 })) },
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

  it("each match carries the viewer's next step (additive `nextStep`)", async () => {
    const soon = new Date(Date.now() + 3 * 86400000);
    const rows = [
      { ...listMatch("m1", "f1"), introRequests: [{ type: "FAMILY", status: "PENDING", expiresAt: soon, senderId: "f1" }] },
      { ...listMatch("m2", "f2"), introRequests: [{ type: "CHAT", status: "PENDING", expiresAt: soon, senderId: "u1" }] },
      { ...listMatch("m3", "f3"), conversation: { status: "ACTIVE", expiresAt: soon } },
      listMatch("m4", "f4"),
      { ...listMatch("m5", "f5"), femaleOutcome: "NOT_A_MATCH", maleOutcome: null },
    ].map((r) => ({ femaleOutcome: null, maleOutcome: null, ...r }));
    db.mutualMatch.findMany.mockResolvedValue(rows);
    db.mutualMatch.count.mockResolvedValue(rows.length);
    const data = await (await getMatches(new Request("http://x/api/matches?page=1"))).json();
    const step = Object.fromEntries(data.matches.map((m: { id: string; nextStep: string | null }) => [m.id, m.nextStep]));
    expect(step).toEqual({ m1: "reply_family", m2: "waiting_chat", m3: "chat_open", m4: "choose", m5: null });
    // The list query reads who sent each request
    expect(JSON.stringify(db.mutualMatch.findMany.mock.calls[0][0].include.introRequests)).toContain("senderId");
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
    // G55: a chat paused for review between the two ends for good
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { status: "ENDED", endedByAdminId: "system:report-review", match: expect.anything() },
      data: { endedById: "u1", endedByAdminId: null },
    });
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
    const data = await (await getCounts(new Request("http://x/api/me/counts"))).json();
    expect(data.actionableMatches).toBe(1);
    expect(db.introRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "CANCELLED" } }));
  });

  function quietCounts() {
    db.introRequest.count.mockResolvedValue(0);
    db.introRequest.findFirst.mockResolvedValue(null);
    db.message.count.mockResolvedValue(0);
    db.conversation.count.mockResolvedValue(0);
    db.parentInfo.findUnique.mockResolvedValue(null);
    db.mutualMatch.findMany.mockResolvedValue([]);
  }

  it("adds the «الجديد» / «مهتمون بالتحدث معك» badge counts, leaving out blocked people", async () => {
    quietCounts();
    db.block.findMany.mockResolvedValue([{ blockerId: "u1", blockedId: "x9" }]);
    db.suggestion.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    const data = await (await getCounts(new Request("http://x/api/me/counts"))).json();
    expect(data.newSuggestions).toBe(4);
    expect(data.likedYou).toBe(2);
    const likedWhere = db.suggestion.count.mock.calls[1][0].where;
    expect(likedWhere.OR[0]).toMatchObject({ recipientId: "u1", recipientDecision: null, candidateDecision: "INTERESTED", candidateId: { notIn: ["x9"] } });
    expect(likedWhere.OR[1]).toMatchObject({ candidateId: "u1", candidateDecision: null, recipientDecision: "INTERESTED", hiddenFromCandidate: false });
  });

  it("a failing badge count never breaks the poll", async () => {
    quietCounts();
    db.block.findMany.mockResolvedValue([]);
    db.suggestion.count.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await getCounts(new Request("http://x/api/me/counts"));
    expect(res.status).toBe(200);
    expect((await res.json()).likedYou).toBeUndefined();
  });
});
