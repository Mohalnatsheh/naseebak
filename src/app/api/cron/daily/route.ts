import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { DAILY_PARTS, runDailyJobs, type DailyPart } from "@/lib/cron/daily";

/**
 * Daily scheduler (reminders, expiry notices, weekly suggestions, re-engagement, account deletions).
 * Call: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://naseebak.com/api/cron/daily?part=morning|evening
 * (no `part` = everything: morning tasks, then evening ones; see src/lib/cron/daily.ts)
 * Safe to call more than once a day: every task is idempotent.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const asked = new URL(request.url).searchParams.get("part") ?? "all";
    if (!(DAILY_PARTS as readonly string[]).includes(asked)) {
      return NextResponse.json({ error: "part must be morning, evening or all" }, { status: 400 });
    }
    return NextResponse.json(await runDailyJobs("cron", asked as DailyPart));
  } catch (error) {
    console.error("Daily cron error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
