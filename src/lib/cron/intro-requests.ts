/**
 * Daily scheduler — introduction requests (family / chat).
 * The lazy paths (match page, send/respond) keep expiring requests silently; the scheduler adds the
 * two messages a lazy path can't send: "your request ran out" to the sender and "2 days left" to the receiver.
 * Every message is claimed with a conditional marker update first, so a re-run never sends it twice.
 */
import type { IntroRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { isUnavailable } from "@/lib/matches/state";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Receiver reminder when this little time is left */
export const REQUEST_REMIND_BEFORE_DAYS = 2;
/** Only tell senders about requests that expired recently (not ones from long before the scheduler existed) */
export const EXPIRY_NOTICE_WINDOW_DAYS = 3;
const BATCH = 500;

const partySelect = { select: { id: true, gender: true, isDeactivated: true, status: true } } as const;
const matchUrl = (matchId: string) => `/dashboard/matches?match=${matchId}`;
const typeLabel = (type: IntroRequestType) => (type === "FAMILY" ? "طلب التعارف العائلي" : "طلب المحادثة");

async function blockedBetween(a: string, b: string): Promise<boolean> {
  const block = await db.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!block;
}

/**
 * Expire PENDING requests past their 7 days (same status as the lazy path, no refund) and tell each
 * sender once: "انتهت مدة طلبك دون رد". Also covers requests the lazy path expired since the last run.
 */
export async function expireIntroRequests(now = new Date()): Promise<{ expired: number; notified: number }> {
  const { count: expired } = await db.introRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const due = await db.introRequest.findMany({
    where: {
      status: "EXPIRED",
      expiryNotifiedAt: null,
      expiresAt: { lt: now, gte: new Date(now.getTime() - EXPIRY_NOTICE_WINDOW_DAYS * DAY_MS) },
    },
    select: { id: true, matchId: true, type: true, senderId: true, sender: partySelect },
    orderBy: { expiresAt: "asc" },
    take: BATCH,
  });

  let notified = 0;
  for (const r of due) {
    const claimed = await db.introRequest.updateMany({
      where: { id: r.id, expiryNotifiedAt: null },
      data: { expiryNotifiedAt: now },
    });
    if (claimed.count !== 1 || isUnavailable(r.sender)) continue;
    await notify({
      userId: r.senderId,
      type: "INTRO_REQUEST",
      title: "انتهت مدة طلبك دون رد",
      body: `مرّت 7 أيام على ${typeLabel(r.type)} دون رد من الطرف الآخر، وانتهت مدته.`,
      url: matchUrl(r.matchId),
      metadata: { matchId: r.matchId, requestId: r.id },
    });
    notified++;
  }
  return { expired, notified };
}

/** One reminder to the receiver of a PENDING request with ≤2 days left. */
export async function remindIntroRequests(now = new Date()): Promise<{ reminded: number }> {
  const due = await db.introRequest.findMany({
    where: {
      status: "PENDING",
      reminderSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + REQUEST_REMIND_BEFORE_DAYS * DAY_MS) },
    },
    select: {
      id: true, matchId: true, type: true, senderId: true, receiverId: true,
      sender: partySelect, receiver: partySelect,
    },
    orderBy: { expiresAt: "asc" },
    take: BATCH,
  });

  let reminded = 0;
  for (const r of due) {
    const claimed = await db.introRequest.updateMany({
      where: { id: r.id, status: "PENDING", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    // A closed match (block, inactive account) is cancelled lazily: don't point anyone at it
    if (isUnavailable(r.sender) || isUnavailable(r.receiver)) continue;
    if (await blockedBetween(r.senderId, r.receiverId)) continue;
    const female = r.receiver.gender === "FEMALE";
    await notify({
      userId: r.receiverId,
      type: "INTRO_REQUEST",
      title: "لديك طلب تعارف ينتهي خلال يومين",
      body: `${female ? "ردّي" : "ردّ"} على ${typeLabel(r.type)} قبل انتهاء مدته.`,
      url: matchUrl(r.matchId),
      metadata: { matchId: r.matchId, requestId: r.id },
    });
    reminded++;
  }
  return { reminded };
}
