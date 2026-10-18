/**
 * Daily scheduler — re-engagement. Users idle 7–30 days (COALESCE(lastActiveAt, updatedAt)) who have
 * something waiting for them (a suggestion to decide, a request to answer, unread chat messages) get
 * one push "لديك ما ينتظرك في نصيبك", at most once per 7 days (`User.reengagedAt`).
 * The push uses the type of what waits, so the user's notification preferences apply.
 */
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { idleBetweenWhere } from "@/lib/activity";
import { openMutualWhere } from "@/lib/suggestions/mutual";
import { hiddenPartnerIds, visibleConversationsWhere } from "@/lib/matches/state";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REENGAGE_MIN_IDLE_DAYS = 7;
export const REENGAGE_MAX_IDLE_DAYS = 30;
export const REENGAGE_EVERY_DAYS = 7;
const BATCH = 500;

export interface Waiting {
  suggestions: number;
  requests: number;
  unreadMessages: number;
  /** Match of the first pending request (to open it directly) */
  requestMatchId: string | null;
}

export async function waitingFor(userId: string, now = new Date()): Promise<Waiting> {
  const hidden = await hiddenPartnerIds(userId);
  const [mutual, legacy, firstRequest, requests, unreadMessages] = await Promise.all([
    db.suggestion.count({ where: openMutualWhere(userId, now) }),
    db.suggestion.count({ where: { recipientId: userId, status: "PENDING", flow: "LEGACY" } }),
    db.introRequest.findFirst({
      where: { receiverId: userId, status: "PENDING", expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: { matchId: true },
    }),
    db.introRequest.count({ where: { receiverId: userId, status: "PENDING", expiresAt: { gt: now } } }),
    db.message.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        // Not a chat with someone who blocked me: it's hidden from me
        conversation: visibleConversationsWhere(userId, hidden),
      },
    }),
  ]);
  return { suggestions: mutual + legacy, requests, unreadMessages, requestMatchId: firstRequest?.matchId ?? null };
}

/** What the push says and where it opens: the most important waiting item first. */
export function reengagementMessage(w: Waiting): { type: NotificationType; body: string; url: string } | null {
  const parts: string[] = [];
  if (w.requests > 0) parts.push(w.requests === 1 ? "طلب تعارف بانتظار ردك" : "طلبات تعارف بانتظار ردك");
  if (w.suggestions > 0) parts.push(w.suggestions === 1 ? "اقتراح توافق بانتظار قرارك" : "اقتراحات توافق بانتظار قرارك");
  if (w.unreadMessages > 0) parts.push("رسائل جديدة في محادثتك");
  if (parts.length === 0) return null;
  const body = `${parts.join("، ")}.`;
  if (w.requests > 0) {
    return {
      type: "INTRO_REQUEST",
      body,
      url: w.requestMatchId ? `/dashboard/matches?match=${w.requestMatchId}` : "/dashboard/matches",
    };
  }
  if (w.suggestions > 0) return { type: "SUGGESTION", body, url: "/dashboard/suggestions" };
  return { type: "CHAT", body, url: "/dashboard/chats" };
}

/** Pages of BATCH idle users walked per run at most */
const MAX_PAGES = 10;

/**
 * Walks the idle users page by page (by id), so the many idle users with nothing waiting (they are
 * never claimed) can't keep the ones with something waiting out of a fixed-size batch.
 */
export async function runReengagement(now = new Date()): Promise<{ idle: number; sent: number }> {
  const notSince = new Date(now.getTime() - REENGAGE_EVERY_DAYS * DAY_MS);
  let idle = 0;
  let sent = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const users = await db.user.findMany({
      where: {
        AND: [
          { role: "USER", isDeactivated: false, status: { not: "SUSPENDED" } },
          idleBetweenWhere(REENGAGE_MIN_IDLE_DAYS, REENGAGE_MAX_IDLE_DAYS, now),
          { OR: [{ reengagedAt: null }, { reengagedAt: { lt: notSince } }] },
        ],
      },
      select: { id: true, lastActiveAt: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    idle += users.length;

    for (const u of users) {
      try {
        const message = reengagementMessage(await waitingFor(u.id, now));
        if (!message) continue;
        // Claim first: a second run (or a parallel one) can't send it again within 7 days
        const claimed = await db.user.updateMany({
          where: { id: u.id, OR: [{ reengagedAt: null }, { reengagedAt: { lt: notSince } }] },
          // This write bumps updatedAt: keep "last seen" where it was for users with no lastActiveAt yet
          data: { reengagedAt: now, ...(u.lastActiveAt ? {} : { lastActiveAt: u.updatedAt }) },
        });
        if (claimed.count !== 1) continue;
        await notify({
          userId: u.id,
          type: message.type,
          title: "لديك ما ينتظرك في نصيبك",
          body: message.body,
          url: message.url,
          pushOnly: true,
          collapseId: "reengagement",
        });
        sent++;
      } catch (error) {
        console.error(`[cron] re-engagement for ${u.id}:`, error);
      }
    }
    if (users.length < BATCH) break;
    cursor = users[users.length - 1].id;
  }
  return { idle, sent };
}
