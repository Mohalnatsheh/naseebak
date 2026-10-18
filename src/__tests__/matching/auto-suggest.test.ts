import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
  notification: { create: vi.fn() },
  creditLedger: { create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
const flags = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => flags);
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/intro/followup", () => ({ isEngaged: vi.fn(async () => false), NOT_ENGAGED: {} }));
// Real scoring, but a test can pin a candidate's score through `scoreFor`
const scoring = vi.hoisted(() => ({ scoreFor: new Map<string, number>() }));
vi.mock("@/lib/matching/score", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/matching/score")>();
  return {
    ...real,
    calculateCompatibility: (a: never, b: { id: string }) => scoring.scoreFor.get(b.id) ?? real.calculateCompatibility(a, b as never),
  };
});

import { autoSuggestForUser, autoSuggestWithReason, minSuggestionScore, nextSuggestionsAtFor } from "@/lib/matching/auto-suggest";

// Profile with every basic + preference field filled → 60% completeness (above the 50% threshold)
const fullProfile = (gender: "MALE" | "FEMALE") => ({
  isComplete: true,
  dateOfBirth: "1995-01-01",
  city: "عمان",
  area: "الصويفية",
  nationality: "أردني",
  education: "بكالوريوس",
  job: "مهندس",
  height: 175,
  weight: 70,
  maritalStatus: gender === "MALE" ? "أعزب" : "عزباء",
  aboutMe: "مرحباً",
  religiosity: gender === "MALE" ? "متدين" : "متدينة",
  smokingStatus: gender === "MALE" ? "غير مدخن" : "غير مدخنة",
  prefAgeMin: 20,
  prefAgeMax: 40,
  prefCity: ["عمان"],
  prefEducation: ["بكالوريوس"],
  prefMaritalStatus: gender === "MALE" ? ["عزباء"] : ["أعزب"],
  prefReligiosity: gender === "MALE" ? ["متدينة"] : ["متدين"],
  prefSmokingStatus: gender === "MALE" ? ["غير مدخنة"] : ["غير مدخن"],
});

const person = (id: string, gender: "MALE" | "FEMALE", profile: object | null = fullProfile(gender), matchCredits = 10) => ({
  id,
  gender,
  matchCredits,
  role: "USER",
  isDeactivated: false,
  profile,
  personalityResult: { vector: [0.8, 0.6, 0.7, 0.5, 0.9], personalityType: "INTJ" },
  photos: [{ id: `${id}-p` }],
  identityDoc: null,
  parentInfo: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  scoring.scoreFor.clear();
  db.suggestion.count.mockResolvedValue(0);
  db.suggestion.findMany.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
  db.suggestion.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  db.notification.create.mockResolvedValue({});
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.update.mockResolvedValue({});
  flags.getCycleFlags.mockResolvedValue({ introRequests: false, chat: false, mutualSuggestions: false });
  db.suggestion.groupBy.mockResolvedValue([]);
  db.suggestion.updateMany.mockResolvedValue({ count: 0 });
});

describe("autoSuggestForUser", () => {
  it("creates up to 3 suggestions and one notification for a qualifying user", async () => {
    db.user.findUnique.mockResolvedValue(person("u1", "MALE"));
    db.user.findMany.mockResolvedValue(["f1", "f2", "f3", "f4"].map((id) => person(id, "FEMALE")));

    const created = await autoSuggestForUser("u1");

    expect(created).toBe(3);
    const { data } = db.suggestion.createMany.mock.calls[0][0];
    expect(data).toHaveLength(3);
    expect(data.every((s: { recipientId: string; compatibilityScore: number }) => s.recipientId === "u1" && s.compatibilityScore >= 30)).toBe(true);
    // Opposite gender only
    expect(db.user.findMany.mock.calls[0][0].where.gender).toBe("FEMALE");
    // Through notify(): in-app row + push that respects the user's settings
    expect(notifyMod.notify.mock.calls.filter((c) => c[0].type === "SUGGESTION")).toHaveLength(1);
  });

  it("test accounts only meet test accounts; real users never meet them", async () => {
    db.user.findUnique.mockResolvedValue({ ...person("tg-real", "MALE"), phone: "962791234567" });
    db.user.findMany.mockResolvedValue([]);
    await autoSuggestForUser("tg-real");
    expect(db.user.findMany.mock.calls[0][0].where.phone.notIn).toContain("962796922292");

    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ ...person("tg-test", "MALE"), phone: "962777000002" });
    db.user.findMany.mockResolvedValue([]);
    await autoSuggestForUser("tg-test");
    expect(db.user.findMany.mock.calls[0][0].where.phone.in).toContain("962796922292");
  });

  it("never suggests suspended people and does not run for a suspended user", async () => {
    db.user.findUnique.mockResolvedValue(person("s1", "MALE"));
    db.user.findMany.mockResolvedValue([person("sf1", "FEMALE")]);
    await autoSuggestForUser("s1");
    expect(db.user.findMany.mock.calls[0][0].where.status).toEqual({ not: "SUSPENDED" });

    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ ...person("s2", "MALE"), status: "SUSPENDED" });
    expect(await autoSuggestForUser("s2")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("does nothing while the user still has pending suggestions", async () => {
    db.user.findUnique.mockResolvedValue(person("u2", "MALE"));
    db.suggestion.count.mockResolvedValue(2);

    expect(await autoSuggestForUser("u2")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when the profile is below the completeness threshold", async () => {
    db.user.findUnique.mockResolvedValue({ ...person("u3", "MALE", { isComplete: true, city: "عمان" }), photos: [], personalityResult: null });

    expect(await autoSuggestForUser("u3")).toBe(0);
    expect(db.suggestion.count).not.toHaveBeenCalled();
  });

  it("excludes people already suggested, matched or blocked", async () => {
    db.user.findUnique.mockResolvedValue(person("u4", "MALE"));
    db.suggestion.findMany.mockResolvedValue([{ recipientId: "u4", candidateId: "fa" }]);
    db.mutualMatch.findMany.mockResolvedValue([{ femaleId: "fb", maleId: "u4" }]);
    db.block.findMany.mockResolvedValue([{ blockerId: "fc", blockedId: "u4" }]);
    db.user.findMany.mockResolvedValue([person("fd", "FEMALE")]);

    await autoSuggestForUser("u4");

    const notIn = db.user.findMany.mock.calls[0][0].where.id.notIn;
    expect(notIn.sort()).toEqual(["fa", "fb", "fc"]);
  });

  it("shares one run between concurrent calls for the same user", async () => {
    db.user.findUnique.mockResolvedValue(person("u5", "MALE"));
    db.user.findMany.mockResolvedValue([person("f5", "FEMALE")]);

    const [a, b] = await Promise.all([autoSuggestForUser("u5"), autoSuggestForUser("u5")]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(db.suggestion.createMany).toHaveBeenCalledTimes(1);
    expect(notifyMod.notify.mock.calls.filter((c) => c[0].type === "SUGGESTION")).toHaveLength(1);
  });

  it("waits before scanning again after a run that found no candidates", async () => {
    db.user.findUnique.mockResolvedValue(person("u6", "MALE"));
    db.user.findMany.mockResolvedValue([]);

    expect(await autoSuggestForUser("u6")).toBe(0);
    expect(await autoSuggestForUser("u6")).toBe(0);
    // The candidate scan is what waits (cards waiting for the user are still shown in between)
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("uses one credit per suggestion and never exceeds the balance", async () => {
    db.user.findUnique.mockResolvedValue(person("c1", "MALE", fullProfile("MALE"), 2));
    db.user.findMany.mockResolvedValue(["g1", "g2", "g3", "g4"].map((id) => person(id, "FEMALE")));

    expect(await autoSuggestForUser("c1")).toBe(2);
    expect(db.suggestion.createMany.mock.calls[0][0].data).toHaveLength(2);
    // Atomic reserve: only succeeds when the balance is still >= 2
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", matchCredits: { gte: 2 } },
      data: { matchCredits: { decrement: 2 } },
    });
  });

  it("tells the user to recharge when the last credit is used", async () => {
    db.user.findUnique.mockResolvedValue(person("c2", "MALE", fullProfile("MALE"), 1));
    db.user.findMany.mockResolvedValue([person("h1", "FEMALE"), person("h2", "FEMALE")]);

    expect(await autoSuggestForUser("c2")).toBe(1);
    const types = notifyMod.notify.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(["SUGGESTION", "PAYMENT"]);
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "c2", type: "PAYMENT" }));
  });

  it("creates nothing when the user has no credits left", async () => {
    db.user.findUnique.mockResolvedValue(person("c3", "MALE", fullProfile("MALE"), 0));

    expect(await autoSuggestForUser("c3")).toBe(0);
    expect(db.suggestion.count).not.toHaveBeenCalled();
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
  });

  it("creates nothing if the credits were spent by a concurrent request", async () => {
    db.user.findUnique.mockResolvedValue(person("c4", "MALE"));
    db.user.findMany.mockResolvedValue([person("k1", "FEMALE")]);
    db.user.updateMany.mockResolvedValue({ count: 0 });

    expect(await autoSuggestForUser("c4")).toBe(0);
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
  });

  it("refunds credits for suggestions that already existed", async () => {
    db.user.findUnique.mockResolvedValue(person("c5", "MALE"));
    db.user.findMany.mockResolvedValue([person("m1", "FEMALE"), person("m2", "FEMALE")]);
    db.suggestion.createMany.mockResolvedValue({ count: 1 });

    expect(await autoSuggestForUser("c5")).toBe(1);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "c5" }, data: { matchCredits: { increment: 1 } } });
  });
});

describe("autoSuggestForUser in per-request credits mode", () => {
  beforeEach(() => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false });
  });

  it("suggests for free, even with 0 credits", async () => {
    db.user.findUnique.mockResolvedValue(person("r1", "MALE", fullProfile("MALE"), 0));
    db.user.findMany.mockResolvedValue(["a", "b", "c", "d"].map((id) => person(id, "FEMALE")));

    expect(await autoSuggestForUser("r1")).toBe(3);
    expect(db.user.updateMany).not.toHaveBeenCalled(); // no reserveCredits
    const types = notifyMod.notify.mock.calls.map((c) => c[0].type);
    expect(types).toEqual(["SUGGESTION"]); // no "credits exhausted" notice
  });

  it("caps suggestions at 3 per rolling 7 days", async () => {
    db.user.findUnique.mockResolvedValue(person("r2", "MALE"));
    db.user.findMany.mockResolvedValue(["a", "b", "c", "d"].map((id) => person(id, "FEMALE")));
    db.suggestion.count.mockImplementation(async ({ where }: { where: { createdAt?: unknown } }) =>
      where.createdAt ? 2 : 0
    );

    expect(await autoSuggestForUser("r2")).toBe(1);
    expect(db.suggestion.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("creates nothing once the weekly cap is reached", async () => {
    db.user.findUnique.mockResolvedValue(person("r3", "MALE"));
    db.user.findMany.mockResolvedValue([person("a", "FEMALE")]);
    db.suggestion.count.mockImplementation(async ({ where }: { where: { createdAt?: unknown } }) =>
      where.createdAt ? 3 : 0
    );

    expect(await autoSuggestForUser("r3")).toBe(0);
    expect(db.suggestion.createMany).not.toHaveBeenCalled();
  });
});

describe("autoSuggestForUser — simultaneous flow", () => {
  beforeEach(() => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false, mutualSuggestions: true });
  });

  it("creates MUTUAL rows that expire, and notifies both sides", async () => {
    db.user.findUnique.mockResolvedValue(person("m1", "MALE"));
    db.user.findMany.mockResolvedValue(["h1", "h2"].map((id) => person(id, "FEMALE")));
    db.suggestion.findMany.mockImplementation(async ({ where }: { where: { flow?: string } }) =>
      where.flow === "MUTUAL" ? [{ recipientId: "m1", candidateId: "h1" }, { recipientId: "m1", candidateId: "h2" }] : []
    );

    expect(await autoSuggestForUser("m1")).toBe(2);
    const { data } = db.suggestion.createMany.mock.calls[0][0];
    expect(data.every((d: { flow: string; expiresAt: Date }) => d.flow === "MUTUAL" && d.expiresAt.getTime() > Date.now() + 6 * 86400000 && d.expiresAt.getTime() <= Date.now() + 7 * 86400000)).toBe(true);
    expect(notifyMod.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "m1", type: "SUGGESTION" }));
    expect(notifyMod.notifyMany.mock.calls[0][0].sort()).toEqual(["h1", "h2"]);
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("skips candidates failing either side's dealbreakers", async () => {
    db.user.findUnique.mockResolvedValue(person("m2", "MALE", { ...fullProfile("MALE"), dealbreakers: ["city"] }));
    db.user.findMany.mockResolvedValue([
      person("h3", "FEMALE", { ...fullProfile("FEMALE"), city: "إربد" }),
      person("h4", "FEMALE", { ...fullProfile("FEMALE"), smokingStatus: null, prefSmokingStatus: ["مدخن"], dealbreakers: ["smokingStatus"] }),
      person("h5", "FEMALE"),
    ]);

    expect(await autoSuggestForUser("m2")).toBe(1);
    expect(db.suggestion.createMany.mock.calls[0][0].data.map((d: { candidateId: string }) => d.candidateId)).toEqual(["h5"]);
  });

  it("skips candidates who already got their weekly suggestions", async () => {
    db.user.findUnique.mockResolvedValue(person("m3", "MALE"));
    db.user.findMany.mockResolvedValue(["h6", "h7"].map((id) => person(id, "FEMALE")));
    db.suggestion.groupBy
      .mockResolvedValueOnce([{ recipientId: "h6", _count: 1 }])
      .mockResolvedValueOnce([{ candidateId: "h6", _count: 2 }]);

    await autoSuggestForUser("m3");
    expect(db.suggestion.createMany.mock.calls[0][0].data.map((d: { candidateId: string }) => d.candidateId)).toEqual(["h7"]);
  });

  it("counts the weekly cap on either side and waits while something is undecided", async () => {
    db.user.findUnique.mockResolvedValue(person("m4", "MALE"));
    db.suggestion.count.mockResolvedValueOnce(1); // an open MUTUAL row to decide
    expect(await autoSuggestForUser("m4")).toBe(0);
    expect(db.suggestion.count.mock.calls[0][0].where).toMatchObject({ flow: "MUTUAL", status: "PENDING" });

    db.user.findUnique.mockResolvedValue(person("m5", "MALE"));
    db.suggestion.count.mockReset();
    db.suggestion.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    expect(await autoSuggestForUser("m5")).toBe(0);
    expect(db.suggestion.count.mock.calls[2][0].where.OR).toEqual([{ recipientId: "m5" }, { candidateId: "m5" }]);
  });

  it("keeps legacy rows when the switch is off", async () => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false, mutualSuggestions: false });
    db.user.findUnique.mockResolvedValue(person("m6", "MALE"));
    db.user.findMany.mockResolvedValue([person("h8", "FEMALE")]);
    await autoSuggestForUser("m6");
    expect(db.suggestion.createMany.mock.calls[0][0].data[0].flow).toBeUndefined();
  });
});

describe("activity (30 days)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("generates nothing for a user idle 30+ days (they get suggestions lazily when back)", async () => {
    db.user.findUnique.mockResolvedValue({ ...person("idle1", "MALE"), lastActiveAt: new Date(Date.now() - 31 * DAY) });
    db.user.findMany.mockResolvedValue([person("x1", "FEMALE")]);
    expect(await autoSuggestForUser("idle1")).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("falls back to updatedAt when lastActiveAt is null", async () => {
    db.user.findUnique.mockResolvedValue({ ...person("idle2", "MALE"), lastActiveAt: null, updatedAt: new Date(Date.now() - 45 * DAY) });
    expect(await autoSuggestForUser("idle2")).toBe(0);
    db.user.findUnique.mockResolvedValue({ ...person("act2", "MALE"), lastActiveAt: null, updatedAt: new Date(Date.now() - 2 * DAY) });
    db.user.findMany.mockResolvedValue([person("x2", "FEMALE")]);
    expect(await autoSuggestForUser("act2")).toBe(1);
  });

  it("only considers candidates active in the last 30 days", async () => {
    db.user.findUnique.mockResolvedValue(person("act3", "MALE"));
    db.user.findMany.mockResolvedValue([]);
    await autoSuggestForUser("act3");
    const { where } = db.user.findMany.mock.calls[0][0];
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].lastActiveAt.gte).toBeInstanceOf(Date);
    expect(where.OR[1]).toMatchObject({ lastActiveAt: null });
    const since = where.OR[0].lastActiveAt.gte.getTime();
    expect(Math.abs(Date.now() - 30 * DAY - since)).toBeLessThan(5000);
  });
});

describe("autoSuggestWithReason", () => {
  const DAY = 24 * 60 * 60 * 1000;
  beforeEach(() => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: true });
  });

  it("says 'pending' while something is undecided", async () => {
    db.user.findUnique.mockResolvedValue(person("why1", "MALE"));
    db.suggestion.count.mockResolvedValue(1);
    expect(await autoSuggestWithReason("why1")).toEqual({ created: 0, reason: "pending", nextSuggestionsAt: null });
  });

  it("says 'weekly_cap' with the date the oldest suggestion of the window ages out", async () => {
    db.user.findUnique.mockResolvedValue(person("why2", "MALE"));
    db.suggestion.count.mockImplementation(async ({ where }: { where: { createdAt?: unknown } }) => (where.createdAt ? 3 : 0));
    const oldest = new Date(Date.now() - 5 * DAY);
    db.suggestion.findFirst.mockResolvedValue({ createdAt: oldest });
    const res = await autoSuggestWithReason("why2");
    expect(res.reason).toBe("weekly_cap");
    expect(res.nextSuggestionsAt).toEqual(new Date(oldest.getTime() + 7 * DAY));
    expect(db.suggestion.findFirst.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
  });

  it("says 'no_candidates' when nobody fits (and again during the retry cooldown)", async () => {
    db.user.findUnique.mockResolvedValue(person("why3", "MALE"));
    db.user.findMany.mockResolvedValue([]);
    expect((await autoSuggestWithReason("why3")).reason).toBe("no_candidates");
    expect((await autoSuggestWithReason("why3")).reason).toBe("no_candidates");
  });

  it("has no reason when suggestions were created", async () => {
    db.user.findUnique.mockResolvedValue(person("why4", "MALE"));
    db.user.findMany.mockResolvedValue([person("y4", "FEMALE")]);
    expect(await autoSuggestWithReason("why4")).toEqual({ created: 1, reason: null, nextSuggestionsAt: null });
  });
});

describe("credit on interest: open cap 5", () => {
  const on = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };
  const females = (n: number) => Array.from({ length: n }, (_, i) => person(`cf${i}`, "FEMALE"));
  /** count() answers: MUTUAL open rows first, then LEGACY pending */
  const openRows = (mutual: number, legacy = 0) => {
    db.suggestion.count.mockImplementation(async ({ where }: { where: { flow?: string } }) =>
      where.flow === "LEGACY" ? legacy : mutual
    );
  };
  beforeEach(() => {
    flags.getCycleFlags.mockResolvedValue(on);
    db.suggestion.findMany.mockImplementation(async ({ where }: { where: { flow?: string; hiddenFromCandidate?: boolean } }) =>
      where.flow === "MUTUAL" && !where.hiddenFromCandidate ? females(6).map((f) => ({ recipientId: "x", candidateId: f.id })) : []
    );
    // Good but not "very good" fits: the 5-open cap applies as usual (85%+ may go above it)
    for (const id of [...females(7).map((f) => f.id), "busy", "free"]) scoring.scoreFor.set(id, 70);
  });

  it("tops up to 5 when 0 open", async () => {
    openRows(0);
    db.user.findUnique.mockResolvedValue(person("co1", "MALE"));
    db.user.findMany.mockResolvedValue(females(7));
    expect(await autoSuggestForUser("co1")).toBe(5);
    expect(db.suggestion.createMany.mock.calls[0][0].data).toHaveLength(5);
  });

  it("tops up 2 when 3 open (legacy pending counts too)", async () => {
    openRows(2, 1);
    db.user.findUnique.mockResolvedValue(person("co2", "MALE"));
    db.user.findMany.mockResolvedValue(females(7));
    expect(await autoSuggestForUser("co2")).toBe(2);
  });

  it('creates nothing and says reason "pending" when 5 open', async () => {
    openRows(5);
    db.user.findUnique.mockResolvedValue(person("co3", "MALE"));
    expect(await autoSuggestWithReason("co3")).toEqual({ created: 0, reason: "pending", nextSuggestionsAt: null });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("a full candidate still gets the card, hidden from them and not notified", async () => {
    openRows(0);
    db.user.findUnique.mockResolvedValue(person("co4b", "MALE"));
    db.user.findMany.mockResolvedValue([person("busy", "FEMALE"), person("free", "FEMALE")]);
    db.suggestion.groupBy
      .mockResolvedValueOnce([{ recipientId: "busy", _count: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    db.suggestion.findMany.mockImplementation(async ({ where }: { where: { flow?: string; hiddenFromCandidate?: boolean } }) =>
      where.flow === "MUTUAL" && where.hiddenFromCandidate === undefined
        ? [{ recipientId: "co4b", candidateId: "busy", hiddenFromCandidate: true }, { recipientId: "co4b", candidateId: "free", hiddenFromCandidate: false }]
        : []
    );
    expect(await autoSuggestForUser("co4b")).toBe(2);
    const data = db.suggestion.createMany.mock.calls[0][0].data as { candidateId: string; hiddenFromCandidate: boolean }[];
    expect(data.find((d) => d.candidateId === "busy")?.hiddenFromCandidate).toBe(true);
    expect(data.find((d) => d.candidateId === "free")?.hiddenFromCandidate).toBe(false);
    expect(notifyMod.notifyMany.mock.calls[0][0]).toEqual(["free"]);
  });

  it("with room again, shows cards made while full before adding anyone new", async () => {
    openRows(3);
    db.user.findUnique.mockResolvedValue(person("co9", "FEMALE"));
    db.suggestion.findMany.mockImplementation(async ({ where }: { where: { hiddenFromCandidate?: boolean } }) =>
      where.hiddenFromCandidate ? [{ id: "h1", expiresAt: new Date(Date.now() + 86400000) }, { id: "h2", expiresAt: null }] : []
    );
    db.suggestion.updateMany.mockResolvedValue({ count: 1 });
    expect(await autoSuggestForUser("co9")).toBe(2);
    const reveal = db.suggestion.updateMany.mock.calls[0][0] as { data: { hiddenFromCandidate: boolean; expiresAt: Date } };
    expect(reveal.data.hiddenFromCandidate).toBe(false);
    expect(reveal.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400000);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("re-suggests a pair whose card closed unanswered over 30 days ago, in the other direction", async () => {
    openRows(0);
    const old = { status: "EXPIRED", recipientDecision: null, candidateDecision: null, expiresAt: new Date(Date.now() - 40 * 86400000), updatedAt: new Date() };
    const recent = { ...old, expiresAt: new Date(Date.now() - 10 * 86400000) };
    const answered = { ...old, recipientDecision: "DECLINED" };
    const past = [
      { recipientId: "co8", candidateId: "again", ...old },
      { recipientId: "co8", candidateId: "tooSoon", ...recent },
      { recipientId: "co8", candidateId: "saidNo", ...answered },
    ];
    db.suggestion.findMany.mockImplementation(async ({ where }: { where: { flow?: string } }) => (where.flow ? [] : past));
    db.user.findUnique.mockResolvedValue(person("co8", "MALE"));
    db.user.findMany.mockImplementation(async ({ where }: { where: { id?: { notIn: string[] } } }) =>
      ["again", "tooSoon", "saidNo"].filter((id) => !where.id?.notIn.includes(id)).map((id) => person(id, "FEMALE"))
    );
    expect(await autoSuggestForUser("co8")).toBe(1);
    expect(db.suggestion.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ recipientId: "again", candidateId: "co8", flow: "MUTUAL" }),
    ]);
  });

  it("never reports weekly_cap and has no weekly window (nextSuggestionsAt null)", async () => {
    // 3 created this week would be the cap with the flag off; with it on the cap does not apply
    db.suggestion.count.mockImplementation(async ({ where }: { where: { createdAt?: unknown; flow?: string } }) =>
      where.createdAt ? 3 : 0
    );
    db.user.findUnique.mockResolvedValue(person("co5", "MALE"));
    db.user.findMany.mockResolvedValue(females(2));
    const res = await autoSuggestWithReason("co5");
    expect(res.reason).toBeNull();
    expect(res.created).toBe(2);
    expect(res.nextSuggestionsAt).toBeNull();
    expect(await nextSuggestionsAtFor("co5")).toBeNull();
    expect(db.suggestion.findFirst).not.toHaveBeenCalled();
  });

  it("drops candidates below 50 (30 is enough with the flag off)", async () => {
    expect(minSuggestionScore({ ...on })).toBe(50);
    expect(minSuggestionScore({ ...on, creditOnInterest: false })).toBe(30);
    scoring.scoreFor.set("lo", 40);
    scoring.scoreFor.set("hi", 55);
    openRows(0);
    db.user.findUnique.mockResolvedValue(person("co7", "MALE"));
    db.user.findMany.mockResolvedValue([person("lo", "FEMALE"), person("hi", "FEMALE")]);
    await autoSuggestForUser("co7");
    expect(db.suggestion.createMany.mock.calls[0][0].data.map((d: { candidateId: string }) => d.candidateId)).toEqual(["hi"]);
  });

  it("flag off keeps candidates scoring 30-49", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...on, creditOnInterest: false });
    scoring.scoreFor.set("lo2", 40);
    db.suggestion.count.mockResolvedValue(0);
    db.user.findUnique.mockResolvedValue(person("co8", "MALE"));
    db.user.findMany.mockResolvedValue([person("lo2", "FEMALE")]);
    expect(await autoSuggestForUser("co8")).toBe(1);
  });

  it("flag off keeps the weekly cap and score 30 (unchanged)", async () => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: false, mutualSuggestions: true, creditOnInterest: false });
    db.user.findUnique.mockResolvedValue(person("co6", "MALE"));
    db.suggestion.count.mockImplementation(async ({ where }: { where: { createdAt?: unknown } }) => (where.createdAt ? 3 : 0));
    expect((await autoSuggestWithReason("co6")).reason).toBe("weekly_cap");
  });
});

describe("pairAvailability", () => {
  it("only a never-answered, long-closed pair is available again", async () => {
    const { pairAvailability } = await import("@/lib/matching/auto-suggest");
    const base = { status: "EXPIRED" as const, recipientDecision: null, candidateDecision: null, expiresAt: new Date(Date.now() - 40 * 86400000), updatedAt: new Date() };
    const map = pairAvailability("me", [
      { recipientId: "me", candidateId: "fwd", ...base },
      { recipientId: "back", candidateId: "me", ...base },
      { recipientId: "me", candidateId: "both", ...base },
      { recipientId: "both", candidateId: "me", ...base },
      { recipientId: "me", candidateId: "open", ...base, status: "PENDING" as const },
    ]);
    expect(map.get("fwd")).toBe("reverse");
    expect(map.has("back")).toBe(false);
    expect(map.get("both")).toBe("no");
    expect(map.get("open")).toBe("no");
  });
});
