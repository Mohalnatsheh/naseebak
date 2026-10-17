import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;
/** A chat lasts at most 21 days at 50 messages/day per person, so this covers every chat. */
const MAX_MESSAGES = 3000;

/** One chat with its full message history, oldest first. Every view is logged (admin id + chat id). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;

    const chat = await db.conversation.findUnique({
      where: { id },
      select: {
        id: true, status: true, createdAt: true, expiresAt: true, extended: true,
        endedById: true, endedByAdminId: true, endedAt: true,
        match: { select: { id: true, female: person, male: person } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: MAX_MESSAGES,
          select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
        },
      },
    });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    console.info(`[admin-chat-view] admin=${result.session.user.id} chat=${id} at=${new Date().toISOString()}`);

    const people = [chat.match.female, chat.match.male];
    return NextResponse.json({
      chat: {
        id: chat.id,
        matchId: chat.match.id,
        people,
        status: effectiveConversationStatus(chat, new Date()),
        createdAt: chat.createdAt,
        expiresAt: chat.expiresAt,
        extended: chat.extended,
        endedAt: chat.endedAt,
        endedBy: chat.endedByAdminId
          ? "admin"
          : chat.endedById
            ? people.find((p) => p.id === chat.endedById)?.firstName ?? "user"
            : null,
      },
      messages: chat.messages,
      truncated: chat.messages.length === MAX_MESSAGES,
    });
  } catch (error) {
    console.error("Admin chat messages error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
