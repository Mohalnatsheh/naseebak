import { NextResponse } from "next/server";
import { processAccountDeletions } from "@/lib/cron/deletions";

/**
 * Cron endpoint to process expired account deletion requests.
 * Protected by a secret token in query params.
 * Call: GET /api/cron/process-deletions?token=SECRET
 * (The daily scheduler, /api/cron/daily, runs the same deletions.)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // Validate secret token
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || token !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deletedCount = await processAccountDeletions();

    return NextResponse.json({
      message: `Processed ${deletedCount} deletions`,
      count: deletedCount,
    });
  } catch (error) {
    console.error("Process deletions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
