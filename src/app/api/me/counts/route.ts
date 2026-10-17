import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";
import { chatHousekeepingForUser } from "@/lib/chat/service";
import { cancelDeadPendingFor, hiddenPartnerIds, loadMatchStates, visibleConversationsWhere } from "@/lib/matches/state";
import { touchLastActive } from "@/lib/activity";

/**
 * Dashboard badges for the new cycle, polled with the unread-notification count:
 * switches, pending requests waiting for my answer, unread chat messages,
 * whether I still need to give guardian consent, and how many matches still have something
 * to do (`actionableMatches`: not blocked, partner active, no introduction under way yet and a family or chat request can be sent).
 * With credit_on_interest on, also my balance (`credits`).
 */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;
    // Polled by every dashboard page: records "last active" (at most one write per hour)
    await touchLastActive(userId);

    const flags = await getCycleFlags();
    // Chats with someone who blocked me are hidden from me, so they never count (badge, "has chats")
    const mine = visibleConversationsWhere(userId, await hiddenPartnerIds(userId));
    if (!flags.introRequests) {
      // Switch off: existing chats stay readable, so keep the chats link for people who have one
      const hasChats = (await db.conversation.count({ where: mine })) > 0;
      return NextResponse.json({ flags, pendingIntros: 0, pendingIntroMatchId: null, unreadChats: 0, hasChats, guardian: null, actionableMatches: 0 });
    }

    // Expire overdue chats and send "2 days left" warnings (no scheduler needed)
    await chatHousekeepingForUser(userId).catch((e) => console.error("Chat housekeeping:", e));
    // Requests to/from someone who blocked, was blocked, deactivated or suspended are cancelled (no refund)
    await cancelDeadPendingFor(userId).catch((e) => console.error("Cancel dead requests:", e));

    const pendingWhere = { receiverId: userId, status: "PENDING" as const, expiresAt: { gt: new Date() } };
    const [pendingIntros, firstPending, unreadChats, chatCount, guardian, states, me] = await Promise.all([
      db.introRequest.count({ where: pendingWhere }),
      // The one that expires first, so the dashboard card can open that match
      db.introRequest.findFirst({ where: pendingWhere, orderBy: { expiresAt: "asc" }, select: { matchId: true } }),
      db.message.count({
        where: {
          readAt: null,
          senderId: { not: userId },
          conversation: mine,
        },
      }),
      db.conversation.count({ where: mine }),
      db.parentInfo.findUnique({ where: { userId }, select: { shareConsentAt: true } }),
      loadMatchStates(userId, flags),
      // Credit on interest: the balance gates "مهتم" (dashboard next step)
      flags.creditOnInterest ? db.user.findUnique({ where: { id: userId }, select: { matchCredits: true } }) : null,
    ]);
    const actionableMatches = [...states.values()].filter((s) => s.actionable).length;

    return NextResponse.json({
      flags,
      pendingIntros,
      pendingIntroMatchId: firstPending?.matchId ?? null,
      unreadChats,
      hasChats: chatCount > 0,
      guardian: { exists: !!guardian, consented: !!guardian?.shareConsentAt },
      actionableMatches,
      ...(flags.creditOnInterest && { credits: me?.matchCredits ?? 0 }),
    });
  } catch (error) {
    console.error("Counts error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
