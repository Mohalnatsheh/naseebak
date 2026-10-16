import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), updateMany: vi.fn() },
  suggestion: { count: vi.fn() },
  introRequest: { findFirst: vi.fn(), count: vi.fn() },
  message: { count: vi.fn() },
}));
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));

import { reengagementMessage, runReengagement } from "@/lib/cron/reengagement";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-16T06:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([]);
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.suggestion.count.mockResolvedValue(0);
  db.introRequest.findFirst.mockResolvedValue(null);
  db.introRequest.count.mockResolvedValue(0);
  db.message.count.mockResolvedValue(0);
});

describe("reengagementMessage", () => {
  it("returns null when nothing waits", () => {
    expect(reengagementMessage({ suggestions: 0, requests: 0, unreadMessages: 0, requestMatchId: null })).toBeNull();
  });

  it("opens the most important item: request, then suggestions, then chats", () => {
    expect(reengagementMessage({ suggestions: 2, requests: 1, unreadMessages: 0, requestMatchId: "m1" })).toMatchObject({
      type: "INTRO_REQUEST",
      url: "/dashboard/matches?match=m1",
    });
    expect(reengagementMessage({ suggestions: 1, requests: 0, unreadMessages: 4, requestMatchId: null })).toMatchObject({
      type: "SUGGESTION",
      url: "/dashboard/suggestions",
    });
    expect(reengagementMessage({ suggestions: 0, requests: 0, unreadMessages: 4, requestMatchId: null })).toMatchObject({
      type: "CHAT",
      url: "/dashboard/chats",
    });
  });
});

describe("runReengagement", () => {
  it("targets users idle 7–30 days not re-engaged in the last 7 days", async () => {
    await runReengagement(now);
    const { where } = db.user.findMany.mock.calls[0][0];
    expect(where.AND[0]).toEqual({ role: "USER", isDeactivated: false, status: { not: "SUSPENDED" } });
    expect(where.AND[2]).toEqual({ OR: [{ reengagedAt: null }, { reengagedAt: { lt: new Date(now.getTime() - 7 * DAY) } }] });
  });

  it("pushes once to a user with something waiting and keeps their last-seen date", async () => {
    const seen = new Date(now.getTime() - 10 * DAY);
    db.user.findMany.mockResolvedValue([{ id: "u1", lastActiveAt: null, updatedAt: seen }]);
    db.introRequest.count.mockResolvedValue(1);
    db.introRequest.findFirst.mockResolvedValue({ matchId: "m9" });
    const res = await runReengagement(now);
    expect(db.user.updateMany.mock.calls[0][0].data).toEqual({ reengagedAt: now, lastActiveAt: seen });
    expect(notifyMod.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", title: "لديك ما ينتظرك في نصيبك", pushOnly: true, url: "/dashboard/matches?match=m9" })
    );
    expect(res).toEqual({ idle: 1, sent: 1 });
  });

  it("sends nothing when nothing waits or the user was already claimed", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", lastActiveAt: new Date(now.getTime() - 10 * DAY), updatedAt: now },
      { id: "u2", lastActiveAt: new Date(now.getTime() - 10 * DAY), updatedAt: now },
    ]);
    db.suggestion.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(1);
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await runReengagement(now);
    expect(notifyMod.notify).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
  });
});
