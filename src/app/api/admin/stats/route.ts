import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { buildFunnel, summarizeIntroRequests } from "@/lib/admin/cycle-stats";

/** Every count on the dashboard is about members, not admins. */
const USERS = { role: "USER" as const };

/** New-cycle numbers for the dashboard (only computed while `intro_requests_enabled` is on). */
async function cycleStats(now: Date, oneWeekAgo: Date) {
  const [intro, activeChats, spent, users, suggestionUsers, matches, acceptedIntros] = await Promise.all([
    db.introRequest.findMany({ select: { type: true, status: true, expiresAt: true } }),
    db.conversation.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
    // Credits spent in the cycle: requests (per-request mode) or «مهتم» (credit on interest), minus the
    // «مهتم» refunds (positive REFUND rows; a payment refund is negative and isn't spending)
    db.creditLedger.aggregate({
      where: {
        createdAt: { gte: oneWeekAgo },
        OR: [{ reason: { in: ["REQUEST", "INTEREST"] } }, { reason: "REFUND", delta: { gt: 0 } }],
      },
      _sum: { delta: true },
    }),
    db.user.findMany({
      where: { role: "USER" },
      select: {
        id: true,
        profile: true,
        personalityResult: { select: { personalityType: true } },
        photos: { select: { id: true } },
        parentInfo: { select: { id: true, parentName: true } },
      },
    }),
    db.suggestion.findMany({ select: { recipientId: true, candidateId: true } }),
    db.mutualMatch.findMany({ select: { femaleId: true, maleId: true } }),
    db.introRequest.findMany({ where: { status: "ACCEPTED" }, select: { senderId: true, receiverId: true } }),
  ]);

  const registered = new Set(users.map((u) => u.id));
  const inRegistered = (ids: string[]) => new Set(ids.filter((id) => registered.has(id))).size;

  return {
    intro: summarizeIntroRequests(intro, now),
    activeChats,
    creditsSpentThisWeek: -(spent._sum.delta ?? 0),
    funnel: buildFunnel({
      registered: users.length,
      // Same gate as auto-suggest: in the new cycle a completed short setup qualifies
      profileReady: users.filter((u) => meetsSuggestionGate(u, true)).length,
      gotSuggestions: inRegistered(suggestionUsers.flatMap((s) => [s.recipientId, s.candidateId])),
      matched: inRegistered(matches.flatMap((m) => [m.femaleId, m.maleId])),
      introAccepted: inRegistered(acceptedIntros.flatMap((r) => [r.senderId, r.receiverId])),
    }),
  };
}

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

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
      revenueThisWeek, flags,
    ] = await Promise.all([
      db.user.count({ where: USERS }),
      db.user.count({ where: { ...USERS, gender: "MALE" } }),
      db.user.count({ where: { ...USERS, gender: "FEMALE" } }),
      db.user.count({ where: { ...USERS, status: "VERIFIED" } }),
      db.identityDoc.count({ where: { status: "PENDING" } }),
      db.mutualMatch.count(),
      db.suggestion.count(),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { ...USERS, status: "SUSPENDED" } }),
      db.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.count({ where: { status: "COMPLETED" } }),
      db.report.count({ where: { status: "PENDING" } }),
      db.profileUpdateRequest.count({ where: { status: "PENDING" } }),
      db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      db.user.count({ where: { ...USERS, isFlagged: true } }),
      db.user.count({ where: { ...USERS, createdAt: { gte: oneWeekAgo } } }),
      db.user.count({ where: { ...USERS, createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      db.user.findMany({
        where: USERS,
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
      db.payment.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: oneWeekAgo } },
        _sum: { amount: true },
      }),
      getCycleFlags(),
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
        description: `${p.user ? `${p.user.firstName} ${p.user.lastName}` : "Deleted account"} paid ${p.amount} JOD (${p.planName})`,
        date: p.createdAt.toISOString(),
      });
    }

    recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const cycle = flags.introRequests ? await cycleStats(now, oneWeekAgo) : null;

    return NextResponse.json({
      flags,
      cycle,
      stats: {
        totalUsers, maleUsers, femaleUsers, verifiedUsers,
        pendingVerifications, totalMatches, totalSuggestions,
        activeSubscriptions, suspendedUsers,
        totalRevenue: totalRevenue._sum.amount || 0,
        revenueThisWeek: revenueThisWeek._sum.amount || 0,
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
