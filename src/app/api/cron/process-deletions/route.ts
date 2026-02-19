import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Cron endpoint to process expired account deletion requests.
 * Protected by a secret token in query params.
 * Call: GET /api/cron/process-deletions?token=SECRET
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

    // Find all requests that are past the scheduled date and not cancelled
    const expiredRequests = await db.accountDeletionRequest.findMany({
      where: {
        scheduledAt: { lte: new Date() },
        cancelledAt: null,
      },
      select: { id: true, userId: true },
    });

    let deletedCount = 0;

    for (const req of expiredRequests) {
      try {
        // Delete all user data (cascade will handle most relations)
        // But we need to clean up manual relations first
        await db.$transaction([
          db.report.deleteMany({ where: { OR: [{ reporterId: req.userId }, { reportedId: req.userId }] } }),
          db.block.deleteMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] } }),
          db.notification.deleteMany({ where: { userId: req.userId } }),
          db.like.deleteMany({ where: { OR: [{ fromUserId: req.userId }, { toUserId: req.userId }] } }),
          db.suggestion.deleteMany({ where: { OR: [{ recipientId: req.userId }, { candidateId: req.userId }] } }),
          db.accountDeletionRequest.delete({ where: { id: req.id } }),
          db.user.delete({ where: { id: req.userId } }),
        ]);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete user ${req.userId}:`, err);
      }
    }

    return NextResponse.json({
      message: `Processed ${deletedCount} deletions`,
      count: deletedCount,
    });
  } catch (error) {
    console.error("Process deletions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
