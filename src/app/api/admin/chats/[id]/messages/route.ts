import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";
import { chatEndedBy } from "@/lib/admin/chat-list";
import { messageMedia } from "@/lib/chat/media";
import { replySnippet } from "@/lib/chat/reply";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;
/** There is no daily cap, so very long chats keep their newest messages (`truncated` marks the cut). */
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
          orderBy: { createdAt: "desc" },
          take: MAX_MESSAGES,
          // Never mediaPath: a photo or voice note is fetched through the members-only route (admins pass by web session)
          select: {
            id: true, senderId: true, body: true, readAt: true, createdAt: true,
            kind: true, mediaType: true, mediaDurationSec: true, mediaWidth: true, mediaHeight: true,
            replyTo: { select: { id: true, conversationId: true, senderId: true, kind: true, body: true } },
            reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    console.info(`[admin-chat-view] admin=${result.session.user.id} chat=${id} at=${new Date().toISOString()}`);

    const reports = await db.report.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      // messageId: «إبلاغ عن الرسالة» (the page highlights those messages)
      select: { id: true, status: true, createdAt: true, messageId: true },
    });

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
        endedBy: chatEndedBy(chat, people),
        reports,
      },
      // newest MAX_MESSAGES, shown oldest first
      messages: [...chat.messages].reverse().map(({ mediaType, mediaDurationSec, mediaWidth, mediaHeight, replyTo, reactions, ...m }) => ({
        ...m,
        kind: m.kind ?? "TEXT",
        // Read-only: the quote (same chat only, as members see it) and who reacted with what
        replyTo: replyTo && replyTo.conversationId === chat.id
          ? { id: replyTo.id, senderId: replyTo.senderId, kind: replyTo.kind ?? "TEXT", snippet: replySnippet(replyTo) }
          : null,
        reactions: reactions ?? [],
        // The same shape as the member chat (lib/chat/media messageMedia)
        media: messageMedia({ id: m.id, conversationId: chat.id, kind: m.kind, mediaType, mediaDurationSec, mediaWidth, mediaHeight }),
      })),
      truncated: chat.messages.length === MAX_MESSAGES,
    });
  } catch (error) {
    console.error("Admin chat messages error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
