import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const [totalUsers, maleUsers, femaleUsers, verifiedUsers, pendingVerifications, totalMatches, totalSuggestions, activeSubscriptions, suspendedUsers] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { gender: "MALE" } }),
      db.user.count({ where: { gender: "FEMALE" } }),
      db.user.count({ where: { status: "VERIFIED" } }),
      db.identityDoc.count({ where: { status: "PENDING" } }),
      db.mutualMatch.count(),
      db.suggestion.count(),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { status: "SUSPENDED" } }),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers, maleUsers, femaleUsers, verifiedUsers,
        pendingVerifications, totalMatches, totalSuggestions,
        activeSubscriptions, suspendedUsers,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
