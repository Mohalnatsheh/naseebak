import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { updateMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { activeWhere, idleBetweenWhere, isActive, lastSeen, touchLastActive } from "@/lib/activity";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-16T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("touchLastActive", () => {
  it("writes only when lastActiveAt is null or older than an hour", async () => {
    await touchLastActive("u1", now);
    const { where, data } = db.user.updateMany.mock.calls[0][0];
    expect(where.id).toBe("u1");
    expect(where.OR).toEqual([
      { lastActiveAt: null },
      { lastActiveAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
    ]);
    expect(data).toEqual({ lastActiveAt: now });
  });

  it("never throws", async () => {
    db.user.updateMany.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(touchLastActive("u1", now)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("isActive", () => {
  it("uses lastActiveAt, falling back to updatedAt", () => {
    expect(lastSeen({ lastActiveAt: null, updatedAt: now })).toBe(now);
    expect(isActive({ lastActiveAt: new Date(now.getTime() - 29 * DAY) }, 30, now)).toBe(true);
    expect(isActive({ lastActiveAt: new Date(now.getTime() - 31 * DAY), updatedAt: now }, 30, now)).toBe(false);
    expect(isActive({ lastActiveAt: null, updatedAt: new Date(now.getTime() - 40 * DAY) }, 30, now)).toBe(false);
    expect(isActive({ lastActiveAt: null, updatedAt: new Date(now.getTime() - 5 * DAY) }, 30, now)).toBe(true);
  });

  it("treats unknown activity as active", () => {
    expect(isActive({}, 30, now)).toBe(true);
  });
});

describe("filters", () => {
  it("activeWhere = COALESCE(lastActiveAt, updatedAt) >= since", () => {
    const since = new Date(now.getTime() - 30 * DAY);
    expect(activeWhere(30, now)).toEqual({
      OR: [{ lastActiveAt: { gte: since } }, { lastActiveAt: null, updatedAt: { gte: since } }],
    });
  });

  it("idleBetweenWhere bounds both ends", () => {
    const w = idleBetweenWhere(7, 30, now);
    expect(w.OR?.[0]).toEqual({
      lastActiveAt: { lt: new Date(now.getTime() - 7 * DAY), gte: new Date(now.getTime() - 30 * DAY) },
    });
  });
});
