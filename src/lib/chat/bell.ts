// Chat messages in the bell (owner decision 2026-10-28: 62% of members in open chats have no push device, so a
// message reached them only if they happened to open the chat). One unread CHAT notification per chat and member,
// rewritten as messages arrive («لديك 3 رسائل جديدة من سارة») and marked read once the chat is read. Never the
// message text. Push, the SMS fallback and the chat's own unread badge are unchanged.
import { db } from "@/lib/db";
import { arabicCount } from "@/lib/utils";

const MESSAGES = { one: "رسالة جديدة", two: "رسالتان جديدتان", few: "رسائل جديدة", many: "رسالة جديدة" };

const forChat = (userId: string, conversationId: string) => ({
  userId,
  type: "CHAT" as const,
  isRead: false,
  metadata: { path: ["conversationId"], equals: conversationId },
});

/** After a message: the recipient's one unread bell entry for this chat, created or brought up to date */
export async function upsertChatBell(recipientId: string, conversationId: string, senderName: string): Promise<void> {
  try {
    const unread = await db.message.count({ where: { conversationId, senderId: { not: recipientId }, readAt: null } });
    if (unread === 0) return;
    const title = "رسائل جديدة";
    const body = `لديك ${arabicCount(unread, MESSAGES)} من ${senderName}`;
    const metadata = { conversationId, url: `/dashboard/chats/${conversationId}`, chatBell: true };
    const existing = await db.notification.findFirst({ where: forChat(recipientId, conversationId), select: { id: true } });
    if (existing) {
      await db.notification.update({ where: { id: existing.id }, data: { title, body, metadata, createdAt: new Date() } });
    } else {
      await db.notification.create({ data: { userId: recipientId, type: "CHAT", title, body, metadata } });
    }
  } catch (error) {
    // Best effort: a bell entry must never fail a sent message
    console.error("[chat-bell] update failed:", conversationId, error);
  }
}

/** The member read the chat: their bell entry for it is done */
export async function clearChatBell(userId: string, conversationId: string): Promise<void> {
  try {
    await db.notification.updateMany({ where: forChat(userId, conversationId), data: { isRead: true } });
  } catch (error) {
    console.error("[chat-bell] clear failed:", conversationId, error);
  }
}
