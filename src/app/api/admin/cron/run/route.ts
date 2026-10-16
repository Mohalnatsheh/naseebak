import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLastDailyRun, runDailyJobs } from "@/lib/cron/daily";

/** Last daily-jobs summary (Admin → Settings). */
export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json({ lastRun: await getLastDailyRun() });
  } catch (error) {
    console.error("Daily jobs status error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** "Run now": the same job as /api/cron/daily (idempotent, so a second run sends nothing twice). */
export async function POST() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    return NextResponse.json({ lastRun: await runDailyJobs("admin") });
  } catch (error) {
    console.error("Daily jobs run error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
