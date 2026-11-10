// Chat messages in the bell (owner decision 2026-10-28: 62% of members in open chats have no push device, so a
// message reached them only if they happened to open the chat). One unread CHAT notification per chat and member,
// rewritten as messages arrive («لديك 3 رسائل جديدة من سارة») and marked read once the chat is read. Never the
// message text. Push, the SMS fallback and the chat's own unread badge are unchanged.
import { db } from "@/lib/db";
import { arabicCount } from "@/lib/utils";

const MESSAGES = { one: "رسالة جديدة", two: "رسالتان جديدتان", few: "رسائل جديدة", many: "رسالة جديدة" };

// Only the bell rows this file writes (`chatBell: true`, written since 7ef2f00). The chat's own notices share
// type CHAT and `conversationId` (family nudge, «تنتهي المحادثة قريباً», «انتهت مدة المحادثة», «تم تمديد المحادثة»,
// end, moderation, leave, reports) and must never be rewritten or marked read by a new message (final review I1).
const bellRows = (userId: string, conversationId: string) => ({
  userId,
  type: "CHAT" as const,
  AND: [
    { metadata: { path: ["conversationId"], equals: conversationId } },
    { metadata: { path: ["chatBell"], equals: true } },
  ],
});

/** The unread bell row(s) of this chat for this member */
const forChat = (userId: string, conversationId: string) => ({ ...bellRows(userId, conversationId), isRead: false });

/** Every bell row of this chat for this member, read or not */
const anyForChat = bellRows;

/**
 * After a message: the recipient's one bell entry for this chat, created or brought up to date (QA A2-L7). The newest
 * bell entry (never one of the chat's notices) is reused even once read, so a live chat read as it goes keeps one row
 * (it used to add a row per message: the read entry was skipped and a new one made); it comes back unread at the top.
 * Any other unread bell entry of the chat (two messages at the same moment) is marked read. Same row shape, so every
 * client reads it as before.
 */
export async function upsertChatBell(recipientId: string, conversationId: string, senderName: string): Promise<void> {
  try {
    const unread = await db.message.count({ where: { conversationId, senderId: { not: recipientId }, readAt: null } });
    if (unread === 0) return;
    const title = "رسائل جديدة";
    const body = `لديك ${arabicCount(unread, MESSAGES)} من ${senderName}`;
    const metadata = { conversationId, url: `/dashboard/chats/${conversationId}`, chatBell: true };
    const existing = await db.notification.findFirst({
      where: anyForChat(recipientId, conversationId),
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      await db.notification.update({
        where: { id: existing.id },
        data: { title, body, metadata, isRead: false, createdAt: new Date() },
      });
      await db.notification.updateMany({
        where: { ...forChat(recipientId, conversationId), id: { not: existing.id } },
        data: { isRead: true },
      });
    } else {
      await db.notification.create({ data: { userId: recipientId, type: "CHAT", title, body, metadata } });
    }
  } catch (error) {
    // Best effort: a bell entry must never fail a sent message
    console.error("[chat-bell] update failed:", conversationId, error);
  }
}

/** The member read the chat: their bell entry for it is done (the chat's notices stay as they are) */
export async function clearChatBell(userId: string, conversationId: string): Promise<void> {
  try {
    await db.notification.updateMany({ where: forChat(userId, conversationId), data: { isRead: true } });
  } catch (error) {
    console.error("[chat-bell] clear failed:", conversationId, error);
  }
}
