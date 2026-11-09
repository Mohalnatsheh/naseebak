import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";
import { chatHousekeepingForUser } from "@/lib/chat/service";
import { cancelDeadPendingFor, hiddenPartnerIds, loadMatchStates, visibleConversationsWhere } from "@/lib/matches/state";
import { touchLastActive } from "@/lib/activity";
import { recordActivityDay } from "@/lib/activity-days";
import { countMutualTabs } from "@/lib/suggestions/feed";
import { getMyProState, isAppRequest } from "@/lib/pro/my-state";
import { proPageShown } from "@/lib/pro/plans";

/**
 * Dashboard badges for the new cycle, polled with the unread-notification count:
 * switches, pending requests waiting for my answer, unread chat messages,
 * whether I still need to give guardian consent, and how many matches still have something
 * to do (`actionableMatches`: not blocked, partner active, no introduction under way yet and a family or chat request can be sent).
 * With credit_on_interest on, also my balance (`credits`).
 * `pro`: my own Pro state for the badge, and `showPage`: whether the Pro page is linked (plans I can buy, or my
 * subscription), the same rule as the Pro page link card.
 */
export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;
    // Polled by every dashboard page: records "last active" (at most one write per hour)
    await touchLastActive(userId);
    await recordActivityDay(userId);

    // The Pro badge lookup runs alongside the switches and the hidden-partner lookup, adding no wait to the poll
    const [flags, proState, hidden] = await Promise.all([
      getCycleFlags(),
      // Badge and Pro link only: a failure just hides them
      getMyProState(userId, { app: isAppRequest(request) }).catch(() => null),
      hiddenPartnerIds(userId),
    ]);
    const pro = { isPro: !!proState?.isPro, cancelAtPeriodEnd: !!proState?.cancelAtPeriodEnd, showPage: proPageShown(proState) };
    // Chats with someone who blocked me are hidden from me, so they never count (badge, "has chats")
    const mine = visibleConversationsWhere(userId, hidden);
    if (!flags.introRequests) {
      // Switch off: existing chats stay readable, so keep the chats link for people who have one
      const hasChats = (await db.conversation.count({ where: mine })) > 0;
      return NextResponse.json({ flags, pendingIntros: 0, pendingIntroMatchId: null, unreadChats: 0, hasChats, guardian: null, actionableMatches: 0, pro });
    }

    // Expire overdue chats and send "2 days left" warnings (no scheduler needed)
    await chatHousekeepingForUser(userId).catch((e) => console.error("Chat housekeeping:", e));
    // Requests to/from someone who blocked, was blocked, deactivated or suspended are cancelled (no refund)
    await cancelDeadPendingFor(userId).catch((e) => console.error("Cancel dead requests:", e));

    const pendingWhere = { receiverId: userId, status: "PENDING" as const, expiresAt: { gt: new Date() } };
    const [pendingIntros, firstPending, unreadChats, chatCount, guardian, states, me, tabs] = await Promise.all([
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
      // Shared suggestions: «الجديد» and «مهتمون بالتحدث معك» badges (home + bottom bar)
      // A failure here only hides those two badges, never the whole poll
      flags.mutualSuggestions
        ? countMutualTabs(userId).catch((e) => {
            console.error("Suggestion counts:", e);
            return null;
          })
        : null,
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
      pro,
      ...(flags.creditOnInterest && { credits: me?.matchCredits ?? 0 }),
      ...(tabs && { newSuggestions: tabs.fresh, likedYou: tabs.likedYou }),
    });
  } catch (error) {
    console.error("Counts error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
