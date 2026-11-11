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
/** Largest page with `?limit=` (QA ADM-26) */
const MAX_PAGE = 500;

/**
 * One chat with its message history, oldest first. Every view is logged (admin id + chat id).
 *
 * Paging (QA ADM-26, additive; without parameters the answer is as before: the newest 3,000):
 * - `?limit=N` (1–500): the newest N messages;
 * - `?limit=N&before=<messageId>`: the N messages just older than that message of this chat («load older»).
 * The answer adds `hasMore` (older messages exist) and `nextBefore` (the id to pass as `before` next, or null).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit === null ? null : Number.parseInt(rawLimit, 10);
    if (parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit < 1)) {
      return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
    }
    const pageSize = parsedLimit === null ? MAX_MESSAGES : Math.min(parsedLimit, MAX_PAGE);
    const before = url.searchParams.get("before")?.slice(0, 64) || null;
    if (before) {
      const anchor = await db.message.findUnique({ where: { id: before }, select: { conversationId: true } });
      if (anchor?.conversationId !== id) return NextResponse.json({ error: "before must be a message of this chat" }, { status: 400 });
    }

    const chat = await db.conversation.findUnique({
      where: { id },
      select: {
        id: true, status: true, createdAt: true, expiresAt: true, extended: true,
        endedById: true, endedByAdminId: true, endedAt: true,
        // Deleted for everyone / cleared: nothing is erased, the admin sees all of it with tags
        clearedAt: true, clearedById: true, clears: { select: { userId: true, clearedAt: true } },
        match: { select: { id: true, female: person, male: person } },
        messages: {
          // Paged: one stable order (time, then id), so messages with the same time never repeat or go missing at an edge
          orderBy: parsedLimit !== null || before ? [{ createdAt: "desc" }, { id: "desc" }] : { createdAt: "desc" },
          // One extra tells whether older messages remain
          take: pageSize + 1,
          ...(before && { cursor: { id: before }, skip: 1 }),
          // Never mediaPath: a photo or voice note is fetched through the members-only route (admins pass by web session)
          select: {
            id: true, senderId: true, body: true, readAt: true, createdAt: true,
            kind: true, deletedAt: true, hides: { select: { userId: true } }, mediaType: true, mediaDurationSec: true, mediaWidth: true, mediaHeight: true,
            replyTo: { select: { id: true, conversationId: true, senderId: true, kind: true, body: true } },
            reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const hasMore = chat.messages.length > pageSize;
    const page = hasMore ? chat.messages.slice(0, pageSize) : chat.messages;

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
        clearedAt: chat.clearedAt ?? null,
        clearedById: chat.clearedById ?? null,
        clears: (chat.clears ?? []).map((c) => ({ userId: c.userId, clearedAt: c.clearedAt })),
      },
      // newest MAX_MESSAGES, shown oldest first
      messages: [...page].reverse().map(({ mediaType, mediaDurationSec, mediaWidth, mediaHeight, replyTo, reactions, deletedAt, hides, ...m }) => ({
        ...m,
        kind: m.kind ?? "TEXT",
        // Read-only: the quote (same chat only, as members see it) and who reacted with what
        replyTo: replyTo && replyTo.conversationId === chat.id
          ? { id: replyTo.id, senderId: replyTo.senderId, kind: replyTo.kind ?? "TEXT", snippet: replySnippet(replyTo) }
          : null,
        reactions: reactions ?? [],
        // Additive: body and media stay as they are. The same `<=` boundary as the member side.
        deletion: {
          forEveryone: !!deletedAt,
          hiddenBy: (hides ?? []).map((h) => h.userId),
          clearedForEveryone: !!chat.clearedAt && m.createdAt <= chat.clearedAt,
          beforeClearOf: (chat.clears ?? []).filter((c) => c.clearedAt >= m.createdAt).map((c) => c.userId),
        },
        // The same shape as the member chat (lib/chat/media messageMedia)
        media: messageMedia({ id: m.id, conversationId: chat.id, kind: m.kind, mediaType, mediaDurationSec, mediaWidth, mediaHeight }),
      })),
      truncated: hasMore,
      hasMore,
      nextBefore: hasMore ? page[page.length - 1].id : null,
    });
  } catch (error) {
    console.error("Admin chat messages error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
