import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createChatTokenRequest, isAblyConfigured } from "@/lib/ably";

/**
 * Ably token request for the signed-in user: subscribe-only on their own conversations.
 * 404 when Ably isn't configured — the chat page then falls back to polling.
 */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    if (!isAblyConfigured()) return NextResponse.json({ error: "غير متاح" }, { status: 404 });
    const userId = result.session.user.id;

    const conversations = await db.conversation.findMany({
      where: { match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
      select: { id: true },
    });
    const token = await createChatTokenRequest(userId, conversations.map((c) => c.id));
    return NextResponse.json(token);
  } catch (error) {
    console.error("Ably token error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
