import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";
import { chatHousekeepingForUser } from "@/lib/chat/service";

/**
 * Dashboard badges for the new cycle, polled with the unread-notification count:
 * switches, pending requests waiting for my answer, unread chat messages,
 * and whether I still need to give guardian consent.
 */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;

    const flags = await getCycleFlags();
    const mine = { match: { OR: [{ femaleId: userId }, { maleId: userId }] } };
    if (!flags.introRequests) {
      // Switch off: existing chats stay readable, so keep the chats link for people who have one
      const hasChats = (await db.conversation.count({ where: mine })) > 0;
      return NextResponse.json({ flags, pendingIntros: 0, unreadChats: 0, hasChats, guardian: null });
    }

    // Expire overdue chats and send "2 days left" warnings (no scheduler needed)
    await chatHousekeepingForUser(userId).catch((e) => console.error("Chat housekeeping:", e));

    const [pendingIntros, unreadChats, chatCount, guardian] = await Promise.all([
      db.introRequest.count({ where: { receiverId: userId, status: "PENDING", expiresAt: { gt: new Date() } } }),
      db.message.count({
        where: {
          readAt: null,
          senderId: { not: userId },
          conversation: { match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
        },
      }),
      db.conversation.count({ where: mine }),
      db.parentInfo.findUnique({ where: { userId }, select: { shareConsentAt: true } }),
    ]);

    return NextResponse.json({
      flags,
      pendingIntros,
      unreadChats,
      hasChats: chatCount > 0,
      guardian: { exists: !!guardian, consented: !!guardian?.shareConsentAt },
    });
  } catch (error) {
    console.error("Counts error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
