/**
 * Admin moderation actions shared by the users, reports and chats pages:
 * suspend / unsuspend (restoring the previous status) and ending a chat.
 * Chats are ended by status only.
 */
import type { UserStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { CHAT_NOTICE_PREFERENCE } from "@/lib/notification-prefs";
import { publishChatEvent } from "@/lib/ably";

export class ModerationError extends Error {
  constructor(public code: "NOT_FOUND" | "ADMIN" | "NOT_ACTIVE", message: string) {
    super(message);
  }
}

/** True when the user exists and is suspended. Used by user-side guards. */
export async function isSuspended(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  return user?.status === "SUSPENDED";
}

/** The status an unsuspended user goes back to. */
export function statusAfterUnsuspend(before: UserStatus | null | undefined): UserStatus {
  return before && before !== "SUSPENDED" ? before : "PENDING";
}

/**
 * End a chat as an admin: status ENDED, endedByAdminId set, both people told.
 * No-op (returns false) when the chat is already ended or expired.
 */
export async function adminEndConversation(
  conversationId: string,
  adminId: string,
  opts: { notifyUserIds?: string[] } = {}
): Promise<boolean> {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true, match: { select: { femaleId: true, maleId: true } } },
  });
  if (!c) throw new ModerationError("NOT_FOUND", "Chat not found");
  const res = await db.conversation.updateMany({
    where: { id: conversationId, status: "ACTIVE" },
    data: { status: "ENDED", endedByAdminId: adminId, endedAt: new Date() },
  });
  if (res.count === 0) return false;
  await publishChatEvent(conversationId, "status", { status: "ENDED" });
  const userIds = opts.notifyUserIds ?? [c.match.femaleId, c.match.maleId];
  await Promise.all(
    userIds.map((userId) =>
      notify({
        userId,
        type: "CHAT",
        title: "انتهت المحادثة",
        body: "أنهى فريق نصيبك هذه المحادثة. يمكنك التواصل مع الدعم لمزيد من المعلومات.",
        url: "/dashboard/chats",
        metadata: { conversationId },
        preference: CHAT_NOTICE_PREFERENCE,
      })
    )
  );
  return true;
}

/**
 * Suspend or unsuspend a user. Suspending remembers the current status and ends the
 * user's active chats (the partner is told); unsuspending restores the remembered status.
 */
export async function setSuspended(
  userId: string,
  suspend: boolean,
  adminId: string
): Promise<{ status: UserStatus; changed: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, statusBeforeSuspension: true },
  });
  if (!user) throw new ModerationError("NOT_FOUND", "User not found");
  if (user.role === "ADMIN") throw new ModerationError("ADMIN", "Admins cannot be suspended");

  if (suspend) {
    if (user.status === "SUSPENDED") return { status: user.status, changed: false };
    await db.user.update({
      where: { id: userId },
      data: { status: "SUSPENDED", statusBeforeSuspension: user.status },
    });
    const active = await db.conversation.findMany({
      where: { status: "ACTIVE", match: { OR: [{ femaleId: userId }, { maleId: userId }] } },
      select: { id: true, match: { select: { femaleId: true, maleId: true } } },
    });
    for (const c of active) {
      const partner = c.match.femaleId === userId ? c.match.maleId : c.match.femaleId;
      await adminEndConversation(c.id, adminId, { notifyUserIds: [partner] });
    }
    await notify({
      userId,
      type: "SYSTEM",
      title: "تم إيقاف حسابك",
      body: "تم إيقاف حسابك من قبل الإدارة. يرجى التواصل مع الدعم لمزيد من المعلومات.",
      url: "/dashboard",
    });
    return { status: "SUSPENDED", changed: true };
  }

  if (user.status !== "SUSPENDED") return { status: user.status, changed: false };
  const status = statusAfterUnsuspend(user.statusBeforeSuspension);
  await db.user.update({ where: { id: userId }, data: { status, statusBeforeSuspension: null } });
  await notify({
    userId,
    type: "SYSTEM",
    title: "تم إعادة تفعيل حسابك",
    body: "تم إعادة تفعيل حسابك بنجاح. يمكنك الآن استخدام المنصة.",
    url: "/dashboard",
  });
  return { status, changed: true };
}
