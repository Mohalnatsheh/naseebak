import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  suggestion: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), groupBy: vi.fn() },
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

import { autoSuggestForUser } from "@/lib/matching/auto-suggest";

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
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(db.notification.create.mock.calls[0][0].data.type).toBe("SUGGESTION");
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
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });

  it("waits before scanning again after a run that found no candidates", async () => {
    db.user.findUnique.mockResolvedValue(person("u6", "MALE"));
    db.user.findMany.mockResolvedValue([]);

    expect(await autoSuggestForUser("u6")).toBe(0);
    expect(await autoSuggestForUser("u6")).toBe(0);
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
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
    const types = db.notification.create.mock.calls.map((c) => c[0].data.type);
    expect(types).toEqual(["SUGGESTION", "PAYMENT"]);
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
    const types = db.notification.create.mock.calls.map((c) => c[0].data.type);
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
      where.flow === "MUTUAL" ? [{ candidateId: "h1" }, { candidateId: "h2" }] : []
    );

    expect(await autoSuggestForUser("m1")).toBe(2);
    const { data } = db.suggestion.createMany.mock.calls[0][0];
    expect(data.every((d: { flow: string; expiresAt: Date }) => d.flow === "MUTUAL" && d.expiresAt.getTime() > Date.now() + 13 * 86400000)).toBe(true);
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
