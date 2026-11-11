/**
 * Chat delete (Pro, switch `chat_delete_enabled`): delete a message or clear the chat, for me or for everyone.
 * Nothing is erased, only hidden from members (admins and reports keep everything); silent: no notice, no bell, no SMS,
 * only the live `deleted` / `cleared` events; the chat and the match stay open.
 *
 * - For everyone (a message: only my own; or the whole chat): an open chat between two active members with no block
 *   (`assertCanSend`).
 * - For me: any chat I can read, ended or expired included (clean-up), and when the partner blocked me.
 * - A message that leaves a recipient's view while unread is stamped read (no `read` event), so unread counts, the
 *   unread SMS and the quiet-chat nudge follow what each member sees.
 */
import { db } from "@/lib/db";
import { publishChatEvent } from "@/lib/ably";
import { clearChatBell } from "@/lib/chat/bell";
import { assertCanSend, loadForUser } from "@/lib/chat/service";
import type { DeleteScope } from "@/lib/chat/visibility";
import { IntroError } from "@/lib/intro/errors";
import { isPro } from "@/lib/pro/status";
import { getChatDeleteEnabled } from "@/lib/settings";

const PRO_ONLY = "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro";

async function assertSwitchOn(): Promise<void> {
  if (!(await getChatDeleteEnabled())) throw new IntroError("DISABLED");
}

/** Pro, not `pro_enabled`: the switch gates sales, a paying member keeps the features (as chat media) */
async function assertPro(userId: string): Promise<void> {
  if (!(await isPro(userId))) throw new IntroError("PRO_REQUIRED", PRO_ONLY);
}

/** The chat for this action: read-only access for «for me», the send checks for «for everyone» */
async function chatFor(conversationId: string, userId: string, scope: DeleteScope) {
  await assertSwitchOn();
  const c = scope === "everyone"
    ? (await assertCanSend(conversationId, userId)).c
    : await loadForUser(conversationId, userId, { readOnly: true });
  await assertPro(userId);
  const partnerId = c.match.femaleId === userId ? c.match.maleId : c.match.femaleId;
  return { c, partnerId };
}

/** One unread message left the recipient's view: their chat bell is done once nothing else waits for them */
async function stampOne(messageId: string, recipientId: string, conversationId: string, now: Date): Promise<void> {
  const { count } = await db.message.updateMany({ where: { id: messageId, readAt: null }, data: { readAt: now } });
  if (count === 0) return;
  const left = await db.message.count({ where: { conversationId, senderId: { not: recipientId }, readAt: null } });
  if (left === 0) await clearChatBell(recipientId, conversationId);
}

export async function deleteMessage(a: {
  conversationId: string;
  messageId: string;
  userId: string;
  scope: DeleteScope;
}): Promise<{ ok: true }> {
  const { conversationId, messageId, userId, scope } = a;
  const { partnerId } = await chatFor(conversationId, userId, scope);
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true, deletedAt: true },
  });
  if (!message || message.conversationId !== conversationId) throw new IntroError("NOT_FOUND", "الرسالة غير موجودة");
  const now = new Date();

  if (scope === "me") {
    await db.messageHide.createMany({ data: [{ messageId, userId }], skipDuplicates: true });
    // The partner's message, unread: it left my view. My own message is still in the partner's view: untouched
    if (message.senderId !== userId) await stampOne(messageId, userId, conversationId, now);
    return { ok: true };
  }

  // For everyone: my own messages only (WhatsApp)
  if (message.senderId !== userId) throw new IntroError("NOT_ALLOWED", "يمكن حذف رسائلك فقط لدى الطرفين");
  if (message.deletedAt) return { ok: true };
  // Conditional: two taps at once write and publish once
  const { count } = await db.message.updateMany({
    where: { id: messageId, senderId: userId, deletedAt: null },
    data: { deletedAt: now },
  });
  if (count === 0) return { ok: true };
  await stampOne(messageId, partnerId, conversationId, now);
  await publishChatEvent(conversationId, "deleted", { messageId });
  return { ok: true };
}

export async function clearChat(a: {
  conversationId: string;
  userId: string;
  scope: DeleteScope;
}): Promise<{ clearedBefore: string }> {
  const { conversationId, userId, scope } = a;
  const { partnerId } = await chatFor(conversationId, userId, scope);
  const now = new Date();

  if (scope === "me") {
    // A second clear moves my point forward
    await db.conversationClear.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, clearedAt: now },
      update: { clearedAt: now },
    });
    const { count } = await db.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null, createdAt: { lte: now } },
      data: { readAt: now },
    });
    if (count > 0) await clearChatBell(userId, conversationId);
    return { clearedBefore: now.toISOString() };
  }

  await db.conversation.update({ where: { id: conversationId }, data: { clearedAt: now, clearedById: userId } });
  const { count } = await db.message.updateMany({
    where: { conversationId, readAt: null, createdAt: { lte: now } },
    data: { readAt: now },
  });
  if (count > 0) {
    await clearChatBell(userId, conversationId);
    await clearChatBell(partnerId, conversationId);
  }
  await publishChatEvent(conversationId, "cleared", { before: now.toISOString() });
  return { clearedBefore: now.toISOString() };
}
