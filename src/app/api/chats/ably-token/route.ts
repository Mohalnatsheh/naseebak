import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hiddenPartnerIds, visibleConversationsWhere } from "@/lib/matches/state";
import { createChatTokenRequest, isAblyConfigured } from "@/lib/ably";

/**
 * Ably token request for the signed-in user: subscribe-only on their own conversations.
 * `{ enabled: false }` (200, no console error) when Ably isn't configured: the chat page then polls. The app
 * reads a missing `keyName` the same way (and old apps still treat a 404 as "not available").
 */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    if (!isAblyConfigured()) return NextResponse.json({ enabled: false });
    const userId = result.session.user.id;

    // Not the chats of a partner who blocked me (they are hidden from me, like the match)
    const hidden = await hiddenPartnerIds(userId);
    const conversations = await db.conversation.findMany({
      where: visibleConversationsWhere(userId, hidden),
      select: { id: true },
    });
    const token = await createChatTokenRequest(userId, conversations.map((c) => c.id));
    return NextResponse.json(token);
  } catch (error) {
    console.error("Ably token error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
