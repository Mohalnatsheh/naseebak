import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, maleUsers, femaleUsers, verifiedUsers,
      pendingVerifications, totalMatches, totalSuggestions,
      activeSubscriptions, suspendedUsers,
      totalRevenue, completedPayments,
      pendingReports, pendingProfileRequests, pendingSupportTickets,
      flaggedUsers,
      registrationsThisWeek, registrationsLastWeek,
      recentUsers, recentMatches, recentPayments,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { gender: "MALE" } }),
      db.user.count({ where: { gender: "FEMALE" } }),
      db.user.count({ where: { status: "VERIFIED" } }),
      db.identityDoc.count({ where: { status: "PENDING" } }),
      db.mutualMatch.count(),
      db.suggestion.count(),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { status: "SUSPENDED" } }),
      db.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.count({ where: { status: "COMPLETED" } }),
      db.report.count({ where: { status: "PENDING" } }),
      db.profileUpdateRequest.count({ where: { status: "PENDING" } }),
      db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      db.user.count({ where: { isFlagged: true } }),
      db.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      db.user.count({ where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, firstName: true, lastName: true, gender: true, createdAt: true },
      }),
      db.mutualMatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          createdAt: true,
          female: { select: { firstName: true, lastName: true } },
          male: { select: { firstName: true, lastName: true } },
        },
      }),
      db.payment.findMany({
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          amount: true,
          planName: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    // Build recent activity timeline
    type ActivityItem = { type: string; description: string; date: string };
    const recentActivity: ActivityItem[] = [];

    for (const u of recentUsers) {
      recentActivity.push({
        type: "registration",
        description: `${u.firstName} ${u.lastName} registered`,
        date: u.createdAt.toISOString(),
      });
    }
    for (const m of recentMatches) {
      recentActivity.push({
        type: "match",
        description: `${m.female.firstName} & ${m.male.firstName} matched`,
        date: m.createdAt.toISOString(),
      });
    }
    for (const p of recentPayments) {
      recentActivity.push({
        type: "payment",
        description: `${p.user.firstName} ${p.user.lastName} paid ${p.amount} JOD (${p.planName})`,
        date: p.createdAt.toISOString(),
      });
    }

    recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      stats: {
        totalUsers, maleUsers, femaleUsers, verifiedUsers,
        pendingVerifications, totalMatches, totalSuggestions,
        activeSubscriptions, suspendedUsers,
        totalRevenue: totalRevenue._sum.amount || 0,
        completedPayments,
        pendingReports,
        pendingProfileRequests,
        pendingSupportTickets,
        flaggedUsers,
        registrationsThisWeek,
        registrationsLastWeek,
      },
      recentActivity: recentActivity.slice(0, 10),
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
