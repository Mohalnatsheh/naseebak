/**
 * Daily scheduler: every task is idempotent (conditional updates + "sent" markers) and isolated, so one
 * failing task never stops the others and a second run on the same day sends nothing twice.
 * The lazy paths (counts poll, page loads) keep working on their own; this only adds what they can't do
 * (reminders, sender notices, suggestions for people who don't visit) and catches up on everyone else.
 *
 * Triggered by GET/POST /api/cron/daily (Bearer CRON_SECRET) and Admin → Settings → "Run now".
 * The last summary is stored in SystemSetting `cron_daily_last_run`.
 */
import { db } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { chatHousekeepingAll } from "@/lib/chat/service";
import { expireIntroRequests, remindIntroRequests } from "@/lib/cron/intro-requests";
import { expireMutualSuggestionsAll, remindMutualSuggestions, runWeeklySuggestions } from "@/lib/cron/suggestions";
import { runReengagement } from "@/lib/cron/reengagement";
import { processAccountDeletions } from "@/lib/cron/deletions";

export const LAST_RUN_KEY = "cron_daily_last_run";

type Counts = Record<string, number | string>;
export type TaskResult = Counts | { error: string };

export interface DailyRunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  trigger: "cron" | "admin";
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
      num(tasks.introReminders, "reminded") + num(tasks.suggestionReminders, "reminded") + num(tasks.chats, "warned"),
    suggestions: num(tasks.weeklySuggestions, "created"),
    expired:
      num(tasks.introExpiry, "expired") + num(tasks.suggestionExpiry, "expired") + num(tasks.chats, "expired"),
    reengaged: num(tasks.reengagement, "sent"),
    deletions: num(tasks.deletions, "deleted"),
    refunds: num(tasks.suggestionExpiry, "refunded"),
    nudges: num(tasks.chats, "nudged"),
    errors: Object.values(tasks).filter((t) => "error" in t).length,
  };
}

async function runTask(name: string, fn: () => Promise<Counts>): Promise<TaskResult> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[cron] task ${name} failed:`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

let running: Promise<DailyRunSummary> | null = null;

/** Run all daily tasks once. A call while a run is in progress shares that run. */
export function runDailyJobs(trigger: DailyRunSummary["trigger"] = "cron"): Promise<DailyRunSummary> {
  if (running) return running;
  running = execute(trigger).finally(() => {
    running = null;
  });
  return running;
}

async function execute(trigger: DailyRunSummary["trigger"]): Promise<DailyRunSummary> {
  const started = new Date();
  const now = () => new Date();
  const tasks: Record<string, TaskResult> = {};

  // Expiry first, so reminders and new suggestions see the cleaned-up state
  tasks.introExpiry = await runTask("introExpiry", () => expireIntroRequests(now()));
  tasks.introReminders = await runTask("introReminders", () => remindIntroRequests(now()));
  tasks.suggestionExpiry = await runTask("suggestionExpiry", () => expireMutualSuggestionsAll(now()));
  tasks.suggestionReminders = await runTask("suggestionReminders", () => remindMutualSuggestions(now()));
  tasks.chats = await runTask("chats", () => chatHousekeepingAll(now()));
  tasks.weeklySuggestions = await runTask("weeklySuggestions", () => runWeeklySuggestions(now()));
  tasks.reengagement = await runTask("reengagement", () => runReengagement(now()));
  tasks.deletions = await runTask("deletions", async () => ({ deleted: await processAccountDeletions() }));

  const finished = new Date();
  const summary: DailyRunSummary = {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    trigger,
    tasks,
    totals: summarise(tasks),
  };
  try {
    await setSetting(LAST_RUN_KEY, JSON.stringify(summary));
  } catch (error) {
    console.error("[cron] could not store the run summary:", error);
  }
  return summary;
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
