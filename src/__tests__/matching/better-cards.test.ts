import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
  notification: { create: vi.fn(), findFirst: vi.fn() },
  creditLedger: { create: vi.fn() },
  activityDay: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
const flags = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => flags);
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/intro/followup", () => ({ isEngaged: vi.fn(async () => false), NOT_ENGAGED: {} }));
const scoring = vi.hoisted(() => ({ scoreFor: new Map<string, number>() }));
vi.mock("@/lib/matching/score", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/matching/score")>();
  return {
    ...real,
    calculateCompatibility: (a: never, b: { id: string }) => scoring.scoreFor.get(b.id) ?? real.calculateCompatibility(a, b as never),
  };
});

import { AGE_SAFETY_OPEN, autoSuggestForUser, pickNewCards, todayFirstOrder } from "@/lib/matching/auto-suggest";

const HOUR = 60 * 60 * 1000;
const YEAR = 365.25 * 24 * HOUR;
const born = (age: number) => new Date(Date.now() - (age + 0.5) * YEAR);

const profile = (gender: "MALE" | "FEMALE", age: number) => ({
  isComplete: true,
  dateOfBirth: born(age),
  city: "عمان",
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: gender === "MALE" ? "أعزب" : "عزباء",
  religiosity: gender === "MALE" ? "متدين" : "متدينة",
  prefAgeMin: 20,
  prefAgeMax: 40,
});

/** A member aged 31 (or `age`), seen `seenHoursAgo` hours ago */
const person = (id: string, gender: "MALE" | "FEMALE", age = 31, seenHoursAgo = 1) => ({
  id,
  gender,
  country: "JO",
  matchCredits: 10,
  role: "USER",
  isDeactivated: false,
  status: "PENDING",
  isFlagged: false,
  phone: null,
  lastActiveAt: new Date(Date.now() - seenHoursAgo * HOUR),
  updatedAt: new Date(),
  profile: profile(gender, age),
  personalityResult: null,
  photos: [],
  identityDoc: null,
  parentInfo: null,
});

const base = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
const openRows = (n: number) => db.suggestion.count.mockImplementation(async ({ where }: { where: { flow?: string; reopenedAt?: unknown } }) =>
  where.reopenedAt ? 0 : where.flow === "LEGACY" ? 0 : n);
const createdIds = () => (db.suggestion.createMany.mock.calls[0]?.[0].data ?? []).map((d: { candidateId: string }) => d.candidateId);

beforeEach(() => {
  vi.clearAllMocks();
  scoring.scoreFor.clear();
  db.suggestion.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
  db.activityDay.findMany.mockResolvedValue([]);
  db.suggestion.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  db.suggestion.groupBy.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
  db.notification.create.mockResolvedValue({});
  db.notification.findFirst.mockResolvedValue(null);
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("todayFirstOrder", () => {
  const today = new Set(["a", "c"]);
  const seen = (r: { id: string }) => today.has(r.id);
  it("puts 70+ today, 70+, under-70 today, then the rest, keeping order inside each group", () => {
    const list = [
      { id: "x", score: 90 }, { id: "a", score: 75 }, { id: "y", score: 62 }, { id: "c", score: 61 }, { id: "z", score: 80 },
    ];
    expect(todayFirstOrder(list, seen).map((r) => r.id)).toEqual(["a", "x", "z", "c", "y"]);
  });
  it("leaves a list with nobody seen today as it is", () => {
    const list = [{ id: "x", score: 90 }, { id: "y", score: 62 }];
    expect(todayFirstOrder(list, seen)).toEqual(list);
  });
});

describe("pickNewCards", () => {
  const fit = ["f1", "f2", "f3"];
  const out = ["o1", "o2", "o3", "o4", "o5", "o6"];
  it("AGE_SAFETY_OPEN is 5", () => expect(AGE_SAFETY_OPEN).toBe(5));
  it("with 0 open: in-range first, then out-of-range up to 5", () => {
    expect(pickNewCards(fit, out, 10, 0)).toEqual(["f1", "f2", "f3", "o1", "o2"]);
  });
  it("with 3 open: only 2 more out-of-range-or-not cards reach 5", () => {
    expect(pickNewCards([], out, 7, 3)).toEqual(["o1", "o2"]);
    expect(pickNewCards(fit, out, 7, 3)).toEqual(["f1", "f2", "f3"]);
  });
  it("with 5 or more open: no out-of-range card at all", () => {
    expect(pickNewCards(fit, out, 5, 5)).toEqual(["f1", "f2", "f3"]);
    expect(pickNewCards([], out, 2, 8)).toEqual([]);
  });
  it("never exceeds the limit", () => {
    expect(pickNewCards(fit, out, 2, 0)).toEqual(["f1", "f2"]);
    expect(pickNewCards([], out, 1, 0)).toEqual(["o1"]);
  });
});

describe("generate with respect_age_range", () => {
  beforeEach(() => flags.getCycleFlags.mockResolvedValue({ ...base, respectAgeRange: true }));

  it("skips an out-of-range woman when the member already has 5 open cards", async () => {
    openRows(5);
    db.user.findUnique.mockResolvedValue(person("m1", "MALE"));
    db.user.findMany.mockResolvedValue([person("inRange", "FEMALE", 30), person("tooOld", "FEMALE", 45)]);
    scoring.scoreFor.set("inRange", 70);
    scoring.scoreFor.set("tooOld", 90);
    expect(await autoSuggestForUser("m1")).toBe(1);
    expect(createdIds()).toEqual(["inRange"]);
  });

  it("fills up to 5 with out-of-range people when nobody in range is left", async () => {
    openRows(0);
    db.user.findUnique.mockResolvedValue(person("m2", "MALE"));
    db.user.findMany.mockResolvedValue(Array.from({ length: 7 }, (_, i) => person(`old${i}`, "FEMALE", 45)));
    for (let i = 0; i < 7; i++) scoring.scoreFor.set(`old${i}`, 80);
    expect(await autoSuggestForUser("m2")).toBe(5);
  });

  it("checks her range too: a man outside her 20–40 is out of range", async () => {
    openRows(5);
    db.user.findUnique.mockResolvedValue(person("w1", "FEMALE", 30));
    db.user.findMany.mockResolvedValue([person("old", "MALE", 50)]);
    scoring.scoreFor.set("old", 85);
    expect(await autoSuggestForUser("w1")).toBe(0);
  });
});

describe("generate with suggest_today_first", () => {
  const twoWomen = () => {
    openRows(9); // room for 1
    db.user.findUnique.mockResolvedValue(person("m3", "MALE"));
    db.user.findMany.mockResolvedValue([person("twoDays", "FEMALE", 30, 48), person("today", "FEMALE", 30, 2)]);
    scoring.scoreFor.set("twoDays", 80);
    scoring.scoreFor.set("today", 72);
  };

  it("gives the one free slot to the woman seen today over a better score seen 2 days ago", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...base, todayFirst: true });
    twoWomen();
    expect(await autoSuggestForUser("m3")).toBe(1);
    expect(createdIds()).toEqual(["today"]);
  });

  it("both switches off: the best score wins as before", async () => {
    flags.getCycleFlags.mockResolvedValue(base);
    twoWomen();
    expect(await autoSuggestForUser("m3")).toBe(1);
    expect(createdIds()).toEqual(["twoDays"]);
  });

  it("a member never seen (lastActiveAt null) is not treated as seen today", () => {
    const list = [{ id: "n", score: 80, seen: null as Date | null }, { id: "t", score: 75, seen: new Date() }];
    expect(todayFirstOrder(list, (r) => !!r.seen).map((r) => r.id)).toEqual(["t", "n"]);
  });
});

describe("both switches on", () => {
  it("age split first, then today-first inside each part", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...base, respectAgeRange: true, todayFirst: true });
    openRows(3); // room for 7, safety net leaves room for 2 below 5
    db.user.findUnique.mockResolvedValue(person("m4", "MALE"));
    db.user.findMany.mockResolvedValue([
      person("inOld", "FEMALE", 30, 48), person("inToday", "FEMALE", 30, 2),
      person("outToday", "FEMALE", 45, 2), person("outOld", "FEMALE", 45, 48),
    ]);
    for (const id of ["inOld", "outOld"]) scoring.scoreFor.set(id, 85);
    for (const id of ["inToday", "outToday"]) scoring.scoreFor.set(id, 75);
    expect(await autoSuggestForUser("m4")).toBe(2);
    expect(createdIds()).toEqual(["inToday", "inOld"]);
  });
});
