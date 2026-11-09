import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { userId: string; status: string; currentPeriodEnd: Date };
const state = vi.hoisted(() => ({ rows: [] as Row[] }));
const db = vi.hoisted(() => ({
  proSubscription: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const settings = vi.hoisted(() => ({ getSetting: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => settings);

import { currentProSubscription, isPro, proUserIds } from "@/lib/pro/status";

const NOW = new Date("2026-11-09T12:00:00Z");
const future = new Date("2026-11-20T00:00:00Z");
const past = new Date("2026-11-01T00:00:00Z");

// Emulates the where clause so the test checks what the query asks for
type Where = { userId?: string | { in: string[] }; status: { in: string[] }; currentPeriodEnd: { gt: Date } };
const match = (where: Where) => state.rows.filter((r) => {
  const u = where.userId;
  const userOk = typeof u === "string" ? r.userId === u : u ? u.in.includes(r.userId) : true;
  return userOk && where.status.in.includes(r.status) && r.currentPeriodEnd > where.currentPeriodEnd.gt;
});

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  db.proSubscription.findFirst.mockImplementation(async ({ where }: { where: Where }) => match(where)[0] ?? null);
  db.proSubscription.findMany.mockImplementation(async ({ where }: { where: Where }) => match(where));
});

describe("isPro", () => {
  it("ACTIVE with a future end is Pro", async () => {
    state.rows = [{ userId: "a", status: "ACTIVE", currentPeriodEnd: future }];
    expect(await isPro("a", NOW)).toBe(true);
  });
  it("PAST_DUE with a future end is Pro", async () => {
    state.rows = [{ userId: "a", status: "PAST_DUE", currentPeriodEnd: future }];
    expect(await isPro("a", NOW)).toBe(true);
  });
  it("ACTIVE with a past end is not Pro", async () => {
    state.rows = [{ userId: "a", status: "ACTIVE", currentPeriodEnd: past }];
    expect(await isPro("a", NOW)).toBe(false);
  });
  it("CANCELED with a future end is not Pro", async () => {
    state.rows = [{ userId: "a", status: "CANCELED", currentPeriodEnd: future }];
    expect(await isPro("a", NOW)).toBe(false);
  });
  it("never reads pro_enabled", async () => {
    state.rows = [{ userId: "a", status: "ACTIVE", currentPeriodEnd: future }];
    await isPro("a", NOW);
    await currentProSubscription("a", NOW);
    expect(settings.getSetting).not.toHaveBeenCalled();
  });
});

describe("proUserIds", () => {
  it("returns only the Pro ids, in one query", async () => {
    state.rows = [{ userId: "a", status: "ACTIVE", currentPeriodEnd: future }];
    const set = await proUserIds(["a", "b"], NOW);
    expect([...set]).toEqual(["a"]);
    expect(db.proSubscription.findMany).toHaveBeenCalledTimes(1);
  });
  it("skips the query for an empty list", async () => {
    expect((await proUserIds([], NOW)).size).toBe(0);
    expect(db.proSubscription.findMany).not.toHaveBeenCalled();
  });
});

describe("currentProSubscription", () => {
  it("is null with no live row", async () => {
    state.rows = [{ userId: "a", status: "ENDED", currentPeriodEnd: future }, { userId: "a", status: "ACTIVE", currentPeriodEnd: past }];
    expect(await currentProSubscription("a", NOW)).toBeNull();
    expect(await currentProSubscription("nobody", NOW)).toBeNull();
  });
  it("asks for the live row with the latest end first", async () => {
    const later = new Date("2026-12-20T00:00:00Z");
    state.rows = [{ userId: "a", status: "ACTIVE", currentPeriodEnd: future }, { userId: "a", status: "PAST_DUE", currentPeriodEnd: later }];
    db.proSubscription.findFirst.mockImplementation(async ({ where, orderBy }: { where: Where; orderBy: { currentPeriodEnd: "asc" | "desc" } }) => {
      const rows = match(where).sort((x, y) => x.currentPeriodEnd.getTime() - y.currentPeriodEnd.getTime());
      return (orderBy.currentPeriodEnd === "desc" ? rows.reverse() : rows)[0] ?? null;
    });
    expect((await currentProSubscription("a", NOW))?.currentPeriodEnd).toEqual(later);
    expect(db.proSubscription.findFirst.mock.calls[0][0].orderBy).toEqual({ currentPeriodEnd: "desc" });
  });
});
