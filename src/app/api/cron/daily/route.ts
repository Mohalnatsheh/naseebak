import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { runDailyJobs } from "@/lib/cron/daily";

/**
 * Daily scheduler (reminders, expiry notices, weekly suggestions, re-engagement, account deletions).
 * Call: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://naseebak.com/api/cron/daily
 * Safe to call more than once a day: every task is idempotent.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDailyJobs("cron"));
  } catch (error) {
    console.error("Daily cron error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
