import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), count: vi.fn() },
  suggestion: { findMany: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
  mutualMatch: { findMany: vi.fn() },
  block: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
const flags = vi.hoisted(() => ({ getCycleFlags: vi.fn() }));
vi.mock("@/lib/settings", () => flags);
const notifyMod = vi.hoisted(() => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/lib/notify", () => notifyMod);
vi.mock("@/lib/intro/match", () => ({ createMutualMatch: vi.fn() }));
vi.mock("@/lib/onesignal", () => ({ sendPushNotification: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ session: { user: { id: "admin1", role: "ADMIN" } } })),
}));
const auto = vi.hoisted(() => ({ autoSuggestForUser: vi.fn(), minSuggestionScore: vi.fn(() => 30) }));
vi.mock("@/lib/matching/auto-suggest", () => auto);
const scores = vi.hoisted(() => ({ byId: new Map<string, number>() }));
vi.mock("@/lib/matching/score", () => ({
  calculateCompatibility: (_a: unknown, b: { id: string }) => scores.byId.get(b.id) ?? 70,
  mutuallyAcceptable: () => true,
}));

import { GET as progress, POST as generate } from "@/app/api/admin/suggestions/generate/route";
import { currentGenerateJob, resetGenerateJob, startGenerateJob } from "@/lib/admin/generate-job";

/** Waits for the background run started by POST to finish */
async function finished() {
  await vi.waitFor(() => expect(currentGenerateJob()?.status).not.toBe("running"));
  return currentGenerateJob()!;
}

/** Admin request; `country` = the admin_country cookie (none → Jordan) */
const req = (country?: string) =>
  new Request("http://localhost/api/admin/suggestions/generate", {
    method: "POST",
    headers: country ? { cookie: `admin_country=${country}` } : {},
  });

const person = (id: string, gender: "MALE" | "FEMALE") => ({
  id, gender, matchCredits: 10, profile: { isComplete: true },
  personalityResult: null, photos: [], identityDoc: null, parentInfo: null,
});
const on = { introRequests: true, chat: true, mutualSuggestions: true, creditOnInterest: true };

beforeEach(() => {
  vi.clearAllMocks();
  scores.byId.clear();
  flags.getCycleFlags.mockResolvedValue(on);
  db.suggestion.findMany.mockResolvedValue([]);
  db.suggestion.create.mockResolvedValue({});
  db.suggestion.groupBy.mockResolvedValue([]);
  db.mutualMatch.findMany.mockResolvedValue([]);
  db.block.findMany.mockResolvedValue([]);
  auto.autoSuggestForUser.mockResolvedValue(0);
  db.user.count.mockResolvedValue(0);
  resetGenerateJob();
});

describe("admin Generate with shared suggestions on (background, ADM-10)", () => {
  it("answers 202 at once and runs the automatic top-up for each eligible, active user in the background", async () => {
    db.user.findMany.mockResolvedValue([{ id: "m1" }, { id: "f1" }, { id: "f2" }]);
    db.user.count.mockResolvedValue(3);
    auto.autoSuggestForUser.mockImplementation(async (id: string) => (id === "m1" ? 2 : id === "f1" ? 1 : 0));
    const res = (await generate(req()))!;
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ started: true, job: { total: 3, status: "running" } });
    const job = await finished();
    expect(job).toMatchObject({ status: "done", done: 3, created: 3, failed: 0 });
    expect(auto.autoSuggestForUser.mock.calls.map((c) => c[0])).toEqual(["m1", "f1", "f2"]);
    const query = db.user.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ role: "USER", isDeactivated: false, isFlagged: false, profile: { isComplete: true } });
    // Idle 30+ days are left out (activeWhere), and the run is capped like the morning job
    expect(query.where.OR).toHaveLength(2);
    expect(query.take).toBe(600);
    // Nothing is created or announced outside autoSuggestForUser
    expect(db.suggestion.create).not.toHaveBeenCalled();
    expect(notifyMod.notify).not.toHaveBeenCalled();
    // GET reads the progress
    expect((await (await progress())!.json()).job).toMatchObject({ status: "done", created: 3 });
  });

  it("refuses a second run while one is going", async () => {
    let release: () => void = () => {};
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    auto.autoSuggestForUser.mockImplementation(() => new Promise<number>((r) => { release = () => r(1); }));
    expect((await generate(req()))!.status).toBe(202);
    const again = (await generate(req()))!;
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_RUNNING");
    await vi.waitFor(() => expect(auto.autoSuggestForUser).toHaveBeenCalled());
    release();
    expect((await finished()).created).toBe(1);
  });

  it("a double click starts one run: the job is claimed before the first await", async () => {
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    const [a, b] = await Promise.all([generate(req()), generate(req())]);
    expect([a!.status, b!.status].sort()).toEqual([202, 409]);
    await finished();
    expect(auto.autoSuggestForUser).toHaveBeenCalledTimes(1);
  });

  it("caps the run at the limit, most recently active first", async () => {
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    db.user.count.mockResolvedValue(900);
    const { job, run } = await startGenerateJob("JO", "admin1", 1);
    await run;
    expect(db.user.findMany.mock.calls[0][0]).toMatchObject({ take: 1, orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } } });
    expect(job).toMatchObject({ eligible: 900, total: 1, done: 1 });
  });

  it("same path with credit on interest off (per-request shared flow)", async () => {
    flags.getCycleFlags.mockResolvedValue({ ...on, creditOnInterest: false });
    db.user.findMany.mockResolvedValue([{ id: "m1" }]);
    await generate(req());
    await finished();
    expect(auto.autoSuggestForUser).toHaveBeenCalledWith("m1");
    expect(db.suggestion.create).not.toHaveBeenCalled();
  });

  it("one user's failure does not stop the run", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.user.findMany.mockResolvedValue([{ id: "bad" }, { id: "ok" }]);
    auto.autoSuggestForUser.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("boom");
      return 1;
    });
    expect((await generate(req()))!.status).toBe(202);
    expect(await finished()).toMatchObject({ created: 1, failed: 1, done: 2 });
    spy.mockRestore();
  });
});

describe("admin Generate with shared suggestions off", () => {
  it("keeps the weekly cap of 3 and score 30 in per-request mode", async () => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: false, creditOnInterest: false });
    scores.byId.set("f3", 40);
    db.user.findMany.mockResolvedValue([person("m1", "MALE"), ...["f1", "f2", "f3"].map((id) => person(id, "FEMALE"))]);
    await generate(req());
    const forM1 = db.suggestion.create.mock.calls.map((c) => c[0].data).filter((d) => d.recipientId === "m1");
    expect(forM1).toHaveLength(3);
    expect(forM1.some((d) => d.candidateId === "f3")).toBe(true);
    expect(forM1.every((d) => d.flow === undefined)).toBe(true);
    expect(auto.autoSuggestForUser).not.toHaveBeenCalled();
  });
});

describe("admin Generate per country (multi-country)", () => {
  it("shared flow: runs only for the admin's selected country (Jordan by default, every country with ALL)", async () => {
    db.user.findMany.mockResolvedValue([]);
    await generate(req());
    await finished();
    expect(db.user.findMany.mock.calls[0][0].where.country).toBe("JO");
    await generate(req("SA"));
    await finished();
    expect(db.user.findMany.mock.calls[1][0].where.country).toBe("SA");
    await generate(req("ALL"));
    await finished();
    expect(db.user.findMany.mock.calls[2][0].where).not.toHaveProperty("country");
  });

  it("legacy flow with ALL: never pairs a Jordanian with a Saudi", async () => {
    flags.getCycleFlags.mockResolvedValue({ introRequests: true, chat: true, mutualSuggestions: false, creditOnInterest: false });
    db.user.findMany.mockResolvedValue([
      { ...person("jo-m", "MALE"), country: "JO" },
      { ...person("jo-f", "FEMALE"), country: "JO" },
      { ...person("sa-m", "MALE"), country: "SA" },
      { ...person("sa-f", "FEMALE"), country: "SA" },
    ]);
    await generate(req("ALL"));
    const pairs = db.suggestion.create.mock.calls.map((c) => [c[0].data.recipientId, c[0].data.candidateId]);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [a, b] of pairs) expect(a.slice(0, 2)).toBe(b.slice(0, 2));
  });
});
