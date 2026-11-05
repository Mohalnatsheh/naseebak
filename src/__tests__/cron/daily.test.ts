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
  remindWaitingInterest: vi.fn(),
  remindUnpaidPayments: vi.fn(),
}));
const authMod = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const alert = vi.hoisted(() => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/admin-alert", () => alert);
vi.mock("@/lib/rate-limit-db", () => ({ purgeExpiredRateLimits: vi.fn(async () => 0) }));
vi.mock("@/lib/engagement/polls", () => ({ runPollRotation: vi.fn(async () => ({ rotated: 0, queueEmpty: 0 })) }));
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
  remindWaitingInterest: tasks.remindWaitingInterest,
}));
vi.mock("@/lib/cron/reengagement", () => ({ runReengagement: tasks.runReengagement }));
vi.mock("@/lib/cron/deletions", () => ({ processAccountDeletions: tasks.processAccountDeletions }));
vi.mock("@/lib/payments/fulfil", () => ({ reconcileStripePayments: vi.fn(async () => ({ checked: 0, fulfilled: 0 })) }));
vi.mock("@/lib/auth", () => authMod);
vi.mock("@/lib/cron/payment-reminders", () => ({ remindUnpaidPayments: tasks.remindUnpaidPayments }));
vi.mock("@/lib/intro/followup", () => ({
  remindGuardianShare: vi.fn(async () => ({ reminded: 0 })),
  runFamilyFollowUps: vi.fn(async () => ({ matches: 0, notified: 0 })),
  cancelClosedLegacyVisits: vi.fn(async () => ({ cancelled: 0 })),
}));

import { LAST_EVENING_RUN_KEY, LAST_RUN_KEY, getLastDailyRun, runDailyJobs } from "@/lib/cron/daily";
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
  tasks.remindWaitingInterest.mockResolvedValue({ members: 0, reminded: 0 });
  tasks.remindUnpaidPayments.mockResolvedValue({ payments: 3, reminded: 2 });
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
    // The admins are emailed about the failed task
    expect(alert.sendAdminAlert).toHaveBeenCalledTimes(1);
    expect(alert.sendAdminAlert.mock.calls[0][0]).toBe("Daily job: 1 task failed");
    expect(alert.sendAdminAlert.mock.calls[0][1]).toContain("introReminders: boom");
  });

  it("sends no alert when every task succeeds", async () => {
    await runDailyJobs("cron");
    expect(alert.sendAdminAlert).not.toHaveBeenCalled();
  });

  it("shares one run between concurrent calls", async () => {
    const [a, b] = await Promise.all([runDailyJobs(), runDailyJobs()]);
    expect(a).toBe(b);
    expect(tasks.expireIntroRequests).toHaveBeenCalledTimes(1);
  });

  it("morning: expiry, suggestions and clean-up, no reminders", async () => {
    const run = await runDailyJobs("cron", "morning");
    expect(run.part).toBe("morning");
    expect(tasks.expireMutualSuggestionsAll).toHaveBeenCalled();
    expect(tasks.runWeeklySuggestions).toHaveBeenCalled();
    for (const t of [tasks.remindIntroRequests, tasks.remindMutualSuggestions, tasks.remindWaitingInterest, tasks.runReengagement]) {
      expect(t).not.toHaveBeenCalled();
    }
    expect(settings.setSetting).toHaveBeenCalledWith(LAST_RUN_KEY, expect.any(String));
  });

  it("evening: only the reminders and nudges, stored under its own key", async () => {
    tasks.remindWaitingInterest.mockResolvedValue({ members: 3, reminded: 2 });
    const run = await runDailyJobs("cron", "evening");
    expect(run.part).toBe("evening");
    for (const t of [tasks.expireIntroRequests, tasks.expireMutualSuggestionsAll, tasks.runWeeklySuggestions, tasks.chatHousekeepingAll, tasks.processAccountDeletions]) {
      expect(t).not.toHaveBeenCalled();
    }
    expect(run.tasks.waitingInterestReminders).toEqual({ members: 3, reminded: 2 });
    expect(run.totals.reminders).toBe(1 + 2 + 2);
    expect(settings.setSetting).toHaveBeenCalledWith(LAST_EVENING_RUN_KEY, expect.any(String));
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

describe("frequent part (every 15 minutes)", () => {
  it("only the unpaid-payment reminder, stored under its own key", async () => {
    const run = await runDailyJobs("cron", "frequent");
    expect(run.part).toBe("frequent");
    expect(tasks.remindUnpaidPayments).toHaveBeenCalled();
    expect(tasks.runWeeklySuggestions).not.toHaveBeenCalled();
    expect(tasks.remindWaitingInterest).not.toHaveBeenCalled();
    expect(run.totals.reminders).toBe(2);
    expect(settings.setSetting.mock.calls[0][0]).toBe("cron_daily_last_run_frequent");
  });

  it("all/morning/evening never send it", async () => {
    await runDailyJobs("cron");
    await runDailyJobs("cron", "evening");
    expect(tasks.remindUnpaidPayments).not.toHaveBeenCalled();
  });
});

describe("cron route ?part=", () => {
  const call = (q: string) => cronGet(new Request(`http://x/api/cron/daily${q}`, { headers: { authorization: "Bearer s3cret" } }));
  it("runs the asked part, refuses an unknown one", async () => {
    expect((await (await call("?part=evening")).json()).part).toBe("evening");
    expect((await (await call("")).json()).part).toBe("all");
    expect((await call("?part=noon")).status).toBe(400);
  });
});
