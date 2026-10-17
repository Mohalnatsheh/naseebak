import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ systemSetting: { findUnique: vi.fn() } }));
const settings = vi.hoisted(() => ({ setSetting: vi.fn() }));
const tasks = vi.hoisted(() => ({
  expireIntroRequests: vi.fn(),
  remindIntroRequests: vi.fn(),
  expireMutualSuggestionsAll: vi.fn(),
  remindMutualSuggestions: vi.fn(),
  runWeeklySuggestions: vi.fn(),
  runReengagement: vi.fn(),
  chatHousekeepingAll: vi.fn(),
  processAccountDeletions: vi.fn(),
}));
const authMod = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/settings", () => settings);
vi.mock("@/lib/chat/service", () => ({ chatHousekeepingAll: tasks.chatHousekeepingAll }));
vi.mock("@/lib/cron/intro-requests", () => ({
  expireIntroRequests: tasks.expireIntroRequests,
  remindIntroRequests: tasks.remindIntroRequests,
}));
vi.mock("@/lib/cron/suggestions", () => ({
  expireMutualSuggestionsAll: tasks.expireMutualSuggestionsAll,
  remindMutualSuggestions: tasks.remindMutualSuggestions,
  runWeeklySuggestions: tasks.runWeeklySuggestions,
  healMissingMatches: vi.fn(async () => ({ healed: 0 })),
}));
vi.mock("@/lib/cron/reengagement", () => ({ runReengagement: tasks.runReengagement }));
vi.mock("@/lib/cron/deletions", () => ({ processAccountDeletions: tasks.processAccountDeletions }));
vi.mock("@/lib/auth", () => authMod);
vi.mock("@/lib/intro/followup", () => ({
  remindGuardianShare: vi.fn(async () => ({ reminded: 0 })),
  runFamilyFollowUps: vi.fn(async () => ({ matches: 0, notified: 0 })),
  cancelClosedLegacyVisits: vi.fn(async () => ({ cancelled: 0 })),
}));

import { LAST_RUN_KEY, getLastDailyRun, runDailyJobs } from "@/lib/cron/daily";
import { isCronAuthorized } from "@/lib/cron/auth";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/daily/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/cron/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  tasks.expireIntroRequests.mockResolvedValue({ expired: 2, notified: 2 });
  tasks.remindIntroRequests.mockResolvedValue({ reminded: 1 });
  tasks.expireMutualSuggestionsAll.mockResolvedValue({ expired: 3 });
  tasks.remindMutualSuggestions.mockResolvedValue({ suggestions: 1, reminded: 2 });
  tasks.chatHousekeepingAll.mockResolvedValue({ expired: 1, warned: 1 });
  tasks.runWeeklySuggestions.mockResolvedValue({ eligible: 5, processed: 5, created: 6, failed: 0 });
  tasks.runReengagement.mockResolvedValue({ idle: 4, sent: 2 });
  tasks.processAccountDeletions.mockResolvedValue(1);
  settings.setSetting.mockResolvedValue(undefined);
  authMod.requireAdmin.mockResolvedValue({ session: { user: { id: "admin1", role: "ADMIN" } } });
  process.env.CRON_SECRET = "s3cret";
});

describe("runDailyJobs", () => {
  it("runs every task, totals the counts and stores the summary", async () => {
    const run = await runDailyJobs("cron");
    expect(run.totals).toEqual({ reminders: 4, suggestions: 6, expired: 6, reengaged: 2, deletions: 1, errors: 0, refunds: 0, nudges: 0, followUps: 0 });
    expect(run.tasks.introExpiry).toEqual({ expired: 2, notified: 2 });
    expect(settings.setSetting).toHaveBeenCalledWith(LAST_RUN_KEY, expect.any(String));
    const stored = JSON.parse(settings.setSetting.mock.calls[0][1]);
    expect(stored.totals.suggestions).toBe(6);
    expect(stored.trigger).toBe("cron");
  });

  it("isolates a failing task: the others still run", async () => {
    tasks.remindIntroRequests.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = await runDailyJobs("admin");
    spy.mockRestore();
    expect(run.tasks.introReminders).toEqual({ error: "boom" });
    expect(tasks.processAccountDeletions).toHaveBeenCalled();
    expect(run.totals.errors).toBe(1);
    expect(run.totals.reminders).toBe(3);
  });

  it("shares one run between concurrent calls", async () => {
    const [a, b] = await Promise.all([runDailyJobs(), runDailyJobs()]);
    expect(a).toBe(b);
    expect(tasks.expireIntroRequests).toHaveBeenCalledTimes(1);
  });

  it("reads the last summary back", async () => {
    db.systemSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ trigger: "cron" }) });
    expect(await getLastDailyRun()).toEqual({ trigger: "cron" });
    db.systemSetting.findUnique.mockResolvedValue(null);
    expect(await getLastDailyRun()).toBeNull();
  });
});

describe("isCronAuthorized", () => {
  const req = (auth?: string) => new Request("http://x/api/cron/daily", { headers: auth ? { authorization: auth } : {} });
  it("needs the exact bearer secret", () => {
    expect(isCronAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isCronAuthorized(req("Bearer wrong"), "s3cret")).toBe(false);
    expect(isCronAuthorized(req("s3cret"), "s3cret")).toBe(false);
    expect(isCronAuthorized(req(), "s3cret")).toBe(false);
  });
  it("refuses everything when CRON_SECRET is not set", () => {
    expect(isCronAuthorized(req("Bearer "), "")).toBe(false);
    expect(isCronAuthorized(req("Bearer anything"), undefined)).toBe(false);
  });
});

describe("/api/cron/daily", () => {
  it("returns 401 without the bearer secret and runs nothing", async () => {
    const res = await cronGet(new Request("http://x/api/cron/daily"));
    expect(res.status).toBe(401);
    const wrong = await cronPost(new Request("http://x/api/cron/daily", { method: "POST", headers: { authorization: "Bearer nope" } }));
    expect(wrong.status).toBe(401);
    expect(tasks.expireIntroRequests).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronGet(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer undefined" } }));
    expect(res.status).toBe(401);
  });

  it("runs the job for GET and POST with the secret", async () => {
    const get = await cronGet(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer s3cret" } }));
    expect(get.status).toBe(200);
    expect((await get.json()).totals.suggestions).toBe(6);
    const post = await cronPost(new Request("http://x/api/cron/daily", { method: "POST", headers: { authorization: "Bearer s3cret" } }));
    expect(post.status).toBe(200);
  });
});

describe("/api/admin/cron/run", () => {
  it("is admin-only", async () => {
    const { NextResponse } = await import("next/server");
    authMod.requireAdmin.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await adminPost())!.status).toBe(403);
    expect((await adminGet())!.status).toBe(403);
    expect(tasks.expireIntroRequests).not.toHaveBeenCalled();
  });

  it("runs the same job and returns the summary", async () => {
    const res = (await adminPost())!;
    expect(res.status).toBe(200);
    const { lastRun } = await res.json();
    expect(lastRun.trigger).toBe("admin");
    expect(lastRun.totals.deletions).toBe(1);
  });
});
