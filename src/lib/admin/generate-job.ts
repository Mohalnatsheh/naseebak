/**
 * Admin «Generate All Suggestions» as a background task (QA ADM-10, 2026-11-11).
 *
 * The run used to happen inside the request, for every eligible member with no cap, and could pass the 5-minute
 * Nginx timeout. Now POST starts it and answers at once; the run tops up at most `WEEKLY_SUGGEST_LIMIT` members (the
 * morning job's cap, most recently active first) one at a time, and GET reads the progress. One run at a time.
 *
 * The state lives in this process (PM2 stays one fork process on purpose), so a restart forgets a finished run's
 * figures; a run cut short by a restart simply stops, and every card it made stays (each top-up is self-contained).
 */
import { db } from "@/lib/db";
import { autoSuggestForUser } from "@/lib/matching/auto-suggest";
import { activeWhere } from "@/lib/activity";
import { WEEKLY_SUGGEST_LIMIT } from "@/lib/cron/suggestions";
import { userCountryWhere, type AdminCountry } from "@/lib/countries/server";

export interface GenerateJob {
  id: string;
  status: "running" | "done" | "failed";
  country: AdminCountry;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  /** Members this run handles (capped) */
  total: number;
  /** Eligible members before the cap */
  eligible: number;
  /** Members handled so far */
  done: number;
  created: number;
  failed: number;
}

const store = globalThis as unknown as { __naseebGenerateJob?: GenerateJob | null };

export function currentGenerateJob(): GenerateJob | null {
  return store.__naseebGenerateJob ?? null;
}

/** Tests only */
export function resetGenerateJob() {
  store.__naseebGenerateJob = null;
}

/**
 * Starts a run unless one is going. Returns the job and whether this call started it. `wait` is for tests: the
 * returned promise of the run itself.
 */
export async function startGenerateJob(
  country: AdminCountry,
  adminId: string,
  limit = WEEKLY_SUGGEST_LIMIT,
): Promise<{ job: GenerateJob; started: boolean; run: Promise<void> }> {
  const existing = currentGenerateJob();
  if (existing?.status === "running") return { job: existing, started: false, run: Promise.resolve() };

  const where = {
    ...userCountryWhere(country),
    role: "USER" as const,
    isDeactivated: false,
    status: { not: "SUSPENDED" as const },
    isFlagged: false,
    profile: { isComplete: true },
    ...activeWhere(30),
  };
  const [eligible, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: { id: true },
      orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      take: limit,
    }),
  ]);

  const job: GenerateJob = {
    id: `gen-${Date.now().toString(36)}`,
    status: "running",
    country,
    startedBy: adminId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    total: users.length,
    eligible,
    done: 0,
    created: 0,
    failed: 0,
  };
  store.__naseebGenerateJob = job;

  const run = (async () => {
    try {
      // One at a time: each run re-reads everyone's open counts, so later members see the cards made before
      for (const u of users) {
        try {
          job.created += await autoSuggestForUser(u.id);
        } catch (error) {
          job.failed++;
          console.error("[admin generate] suggestions for", u.id, error);
        }
        job.done++;
      }
      job.status = "done";
    } catch (error) {
      job.status = "failed";
      console.error("[admin generate] run failed:", error);
    } finally {
      job.finishedAt = new Date().toISOString();
      console.log(`[admin generate] ${job.id} ${job.status}: ${job.created} cards for ${job.done}/${job.total} members`);
    }
  })();
  return { job, started: true, run };
}
