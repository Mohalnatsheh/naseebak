/**
 * Daily scheduler: every task is idempotent (conditional updates + "sent" markers) and isolated, so one
 * failing task never stops the others and a second run on the same day sends nothing twice.
 * The lazy paths (counts poll, page loads) keep working on their own; this only adds what they can't do
 * (reminders, sender notices, suggestions for people who don't visit) and catches up on everyone else.
 *
 * Triggered by GET/POST /api/cron/daily (Bearer CRON_SECRET) and Admin → Settings → "Run now".
 * The last summary is stored in SystemSetting `cron_daily_last_run` (the evening part in `cron_daily_last_run_evening`).
 *
 * Two parts since 2026-11-04 (owner decision): `morning` (06:00 Amman: expiry, refunds, new suggestions, chats,
 * clean-up) and `evening` (18:00, the online peak — 06:00 was the quietest hour: the reminders and nudges). `all`
 * (the admin's «Run now», or a call without `?part=`) runs both, morning first.
 */
import { db } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { chatHousekeepingAll } from "@/lib/chat/service";
import { expireIntroRequests, remindIntroRequests } from "@/lib/cron/intro-requests";
import { expireMutualSuggestionsAll, healMissingMatches, remindMutualSuggestions, remindWaitingInterest, runWeeklySuggestions } from "@/lib/cron/suggestions";
import { notifyRefunds } from "@/lib/cron/refund-notices";
import { runReengagement } from "@/lib/cron/reengagement";
import { processAccountDeletions } from "@/lib/cron/deletions";
import { reconcileStripePayments } from "@/lib/payments/fulfil";
import { cancelClosedLegacyVisits, remindGuardianShare, runFamilyFollowUps } from "@/lib/intro/followup";
import { sendAdminAlert } from "@/lib/admin-alert";
import { purgeExpiredRateLimits } from "@/lib/rate-limit-db";
import { runPollRotation } from "@/lib/engagement/polls";

export const LAST_RUN_KEY = "cron_daily_last_run";
export const LAST_EVENING_RUN_KEY = "cron_daily_last_run_evening";
export const DAILY_PARTS = ["all", "morning", "evening"] as const;
export type DailyPart = (typeof DAILY_PARTS)[number];

type Counts = Record<string, number | string>;
export type TaskResult = Counts | { error: string };

export interface DailyRunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  trigger: "cron" | "admin";
  part?: DailyPart;
  tasks: Record<string, TaskResult>;
  totals: { reminders: number; suggestions: number; expired: number; reengaged: number; deletions: number; errors: number; refunds?: number; nudges?: number };
}

const num = (r: TaskResult | undefined, key: string): number => {
  if (!r || "error" in r) return 0;
  const v = r[key];
  return typeof v === "number" ? v : 0;
};

export function summarise(tasks: Record<string, TaskResult>) {
  return {
    reminders:
      num(tasks.introReminders, "reminded") +
      num(tasks.suggestionReminders, "reminded") +
      num(tasks.chats, "warned") +
      num(tasks.guardianShareReminders, "reminded") +
      num(tasks.waitingInterestReminders, "reminded") +
      num(tasks.refundNotices, "notified"),
    suggestions: num(tasks.weeklySuggestions, "created"),
    expired:
      num(tasks.introExpiry, "expired") + num(tasks.suggestionExpiry, "expired") + num(tasks.chats, "expired"),
    reengaged: num(tasks.reengagement, "sent"),
    deletions: num(tasks.deletions, "deleted"),
    refunds: num(tasks.suggestionExpiry, "refunded"),
    nudges: num(tasks.chats, "nudged"),
    followUps: num(tasks.familyFollowUps, "notified"),
    errors: Object.values(tasks).filter((t) => "error" in t).length,
  };
}

async function runTask(name: string, fn: () => Promise<Counts>): Promise<TaskResult> {
  const t0 = Date.now();
  try {
    return await fn();
  } catch (error) {
    console.error(`[cron] task ${name} failed:`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    // Per-task time in the PM2 log, to see which task makes the run long
    console.log(`[cron] task ${name}: ${Date.now() - t0}ms`);
  }
}

const running = new Map<DailyPart, Promise<DailyRunSummary>>();

/** Run the daily tasks of `part` once. A call while that part is running shares that run. */
export function runDailyJobs(trigger: DailyRunSummary["trigger"] = "cron", part: DailyPart = "all"): Promise<DailyRunSummary> {
  const current = running.get(part);
  if (current) return current;
  const run = execute(trigger, part).finally(() => {
    running.delete(part);
  });
  running.set(part, run);
  return run;
}

async function execute(trigger: DailyRunSummary["trigger"], part: DailyPart): Promise<DailyRunSummary> {
  const started = new Date();
  const now = () => new Date();
  const tasks: Record<string, TaskResult> = {};
  const morning = part !== "evening";
  const evening = part !== "morning";

  if (morning) {
    // Expiry first, so reminders and new suggestions see the cleaned-up state
    tasks.introExpiry = await runTask("introExpiry", () => expireIntroRequests(now()));
    tasks.suggestionExpiry = await runTask("suggestionExpiry", () => expireMutualSuggestionsAll(now()));
    tasks.chats = await runTask("chats", () => chatHousekeepingAll(now()));
    tasks.matchHeal = await runTask("matchHeal", () => healMissingMatches(now()));
    tasks.legacyVisits = await runTask("legacyVisits", () => cancelClosedLegacyVisits());
    tasks.weeklySuggestions = await runTask("weeklySuggestions", () => runWeeklySuggestions(now()));
    tasks.deletions = await runTask("deletions", async () => ({ deleted: await processAccountDeletions() }));
    tasks.payments = await runTask("payments", () => reconcileStripePayments(now()));
    tasks.pollRotation = await runTask("pollRotation", () => runPollRotation(now()));
    tasks.rateLimits = await runTask("rateLimits", async () => ({ purged: await purgeExpiredRateLimits(now()) }));
  }
  if (evening) {
    // Pushes at the online peak; push + bell only (no SMS for any of them)
    tasks.introReminders = await runTask("introReminders", () => remindIntroRequests(now()));
    tasks.suggestionReminders = await runTask("suggestionReminders", () => remindMutualSuggestions(now()));
    tasks.waitingInterestReminders = await runTask("waitingInterestReminders", () => remindWaitingInterest(now()));
    tasks.refundNotices = await runTask("refundNotices", () => notifyRefunds(now()));
    tasks.guardianShareReminders = await runTask("guardianShareReminders", () => remindGuardianShare(now()));
    tasks.familyFollowUps = await runTask("familyFollowUps", () => runFamilyFollowUps(now()));
    tasks.reengagement = await runTask("reengagement", () => runReengagement(now()));
  }

  const finished = new Date();
  const summary: DailyRunSummary = {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    trigger,
    part,
    tasks,
    totals: summarise(tasks),
  };
  try {
    await setSetting(part === "evening" ? LAST_EVENING_RUN_KEY : LAST_RUN_KEY, JSON.stringify(summary));
  } catch (error) {
    console.error("[cron] could not store the run summary:", error);
  }
  await alertFailedTasks(summary);
  return summary;
}

/** Email the admins when a task failed (best-effort: sendAdminAlert never throws) */
export async function alertFailedTasks(summary: DailyRunSummary): Promise<void> {
  const failed = Object.entries(summary.tasks).filter(
    (entry): entry is [string, { error: string }] => "error" in entry[1],
  );
  if (failed.length === 0) return;
  const lines = failed.map(([name, r]) => `- ${name}: ${r.error}`);
  await sendAdminAlert(
    `Daily job: ${failed.length} task${failed.length === 1 ? "" : "s"} failed`,
    [
      `The daily job (${summary.trigger}, started ${summary.startedAt}) finished with errors:`,
      ...lines,
      "",
      "The other tasks ran normally. Details are in /var/log/naseebak/error-0.log and Admin → Settings → Daily jobs.",
    ].join("\n"),
  );
}

/** The last stored summary (admin Settings), or null before the first run. */
export async function getLastDailyRun(): Promise<DailyRunSummary | null> {
  const row = await db.systemSetting.findUnique({ where: { key: LAST_RUN_KEY } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as DailyRunSummary;
  } catch {
    return null;
  }
}
