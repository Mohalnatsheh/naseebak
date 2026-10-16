import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";

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
    if (!flags.introRequests) {
      return NextResponse.json({ flags, pendingIntros: 0, unreadChats: 0, guardian: null });
    }

    const [pendingIntros, unreadChats, guardian] = await Promise.all([
      db.introRequest.count({ where: { receiverId: userId, status: "PENDING", expiresAt: { gt: new Date() } } }),
      db.message.count({
        where: {
          readAt: null,
          senderId: { not: userId },
          conversation: { match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
        },
      }),
      db.parentInfo.findUnique({ where: { userId }, select: { shareConsentAt: true } }),
    ]);

    return NextResponse.json({
      flags,
      pendingIntros,
      unreadChats,
      guardian: { exists: !!guardian, consented: !!guardian?.shareConsentAt },
    });
  } catch (error) {
    console.error("Counts error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
