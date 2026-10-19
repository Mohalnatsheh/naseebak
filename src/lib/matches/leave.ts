/**
 * Someone leaves (pauses their account, asks for deletion, or is deleted): close what they were part of,
 * so their partners aren't left with a half-alive chat or a request that can never be answered.
 * - Open chats end (no more messages or extensions), and the partner is told once.
 * - Pending family / chat requests between them and anyone are cancelled, and the other person on
 *   each is told (not on the final deletion: the match notice below covers it).
 * - On the final deletion, partners on every remaining match are told before the match disappears.
 * Reactivating later doesn't reopen anything: ended chats stay ended.
 */
import { db } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notify";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { publishChatEvent } from "@/lib/ably";
import { endPausedChats } from "@/lib/reports";
import { CHAT_LEFT_MARKER } from "@/lib/matches/state";

export async function closeActivityForLeaving(userId: string, reason: "paused" | "deleting" | "deleted"): Promise<void> {
  const now = new Date();
  const mine = { OR: [{ femaleId: userId }, { maleId: userId }] };

  const active = await db.conversation.findMany({
    where: { status: "ACTIVE", match: mine },
    select: { id: true, match: { select: { femaleId: true, maleId: true } } },
  });
  for (const c of active) {
    const ended = await db.conversation.updateMany({
      where: { id: c.id, status: "ACTIVE" },
      // A system marker, not endedById: leaving isn't "a user ended the chat", so the partner keeps
      // the free family move on this match (chatEndedByUser)
      data: { status: "ENDED", endedByAdminId: CHAT_LEFT_MARKER, endedAt: now },
    });
    if (ended.count !== 1) continue;
    await publishChatEvent(c.id, "status", { status: "ENDED" }).catch(() => {});
    if (reason === "deleted") continue; // told below with the match notice
    const partner = c.match.femaleId === userId ? c.match.maleId : c.match.femaleId;
    await notify({
      userId: partner,
      type: "CHAT",
      title: "انتهت المحادثة",
      body: "انتهت المحادثة لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة.",
      url: "/dashboard/chats",
      metadata: { conversationId: c.id },
      preference: CHAT_NOTICE_PREFERENCE,
    });
  }

  // Chats paused for a report review end for good as well (a later review must not reopen them)
  await endPausedChats(mine, { endedByAdminId: CHAT_LEFT_MARKER });

  const pendingWhere = { status: "PENDING" as const, OR: [{ senderId: userId }, { receiverId: userId }] };
  const pending =
    reason === "deleted"
      ? []
      : ((await db.introRequest.findMany({
          where: pendingWhere,
          select: { id: true, matchId: true, type: true, senderId: true, receiverId: true },
        })) ?? []);
  await db.introRequest.updateMany({ where: pendingWhere, data: { status: "CANCELLED" } });
  // Tell the other person on each cancelled request, once per match (a request that just vanishes
  // looks like it was ignored)
  const told = new Set<string>();
  for (const r of pending) {
    if (told.has(r.matchId)) continue;
    told.add(r.matchId);
    const other = r.senderId === userId ? r.receiverId : r.senderId;
    const mine = r.senderId === other;
    try {
      await notify({
        userId: other,
        type: "INTRO_REQUEST",
        title: r.type === "FAMILY" ? "أُلغي طلب التعارف العائلي" : "أُلغي طلب المحادثة",
        body: mine
          ? "أُلغي طلبك لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
          : "أُلغي الطلب لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة.",
        url: `/dashboard/matches?match=${r.matchId}`,
        metadata: { matchId: r.matchId, requestId: r.id },
      });
    } catch (e) {
      console.error("[leave] request cancelled notice", e);
    }
  }

  if (reason === "deleted") {
    const matches = await db.mutualMatch.findMany({
      where: mine,
      select: { femaleId: true, maleId: true, femaleOutcome: true, maleOutcome: true },
    });
    // A match someone already ended («لم يحصل نصيب») needs no second notice
    const open = matches.filter((m) => m.femaleOutcome !== "NOT_A_MATCH" && m.maleOutcome !== "NOT_A_MATCH");
    const partners = [...new Set(open.map((m) => (m.femaleId === userId ? m.maleId : m.femaleId)))];
    // Partners who blocked this person or whom this person blocked don't need a notice
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
    const tell = partners.filter((p) => !blocked.has(p));
    if (tell.length > 0) {
      await notifyMany(tell, {
        type: "MATCH",
        title: "انتهى أحد التوافقات",
        body: "حذف الطرف الآخر حسابه، فانتهى التوافق بينكما. نتمنى لك التوفيق في اقتراحاتك القادمة.",
        url: "/dashboard/matches",
      });
    }
  }
}
