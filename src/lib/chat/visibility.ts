// Chat delete: who can see which message. Nothing is erased, only hidden from
// members. Db-free: client components import DELETED_TRACE and deleteEntryMode.
import type { Prisma } from "@prisma/client";

export const DELETED_TRACE = "تم حذف الرسالة";

/** The later of the chat-wide clear and my own clear, or null. */
export function viewerCutoff(
  chatClearedAt: Date | null,
  myClearAt: Date | null,
): Date | null {
  if (!chatClearedAt) return myClearAt;
  if (!myClearAt) return chatClearedAt;
  return chatClearedAt > myClearAt ? chatClearedAt : myClearAt;
}

/** Messages the viewer may see. Combine with cursors as `{ AND: [visible, cursor] }`. */
export function visibleMessageWhere(
  conversationId: string,
  userId: string,
  cutoff: Date | null,
): Prisma.MessageWhereInput {
  return {
    conversationId,
    hides: { none: { userId } },
    ...(cutoff && { createdAt: { gt: cutoff } }),
  };
}

export function hiddenForViewer(
  m: { createdAt: Date; hides?: { userId: string }[] },
  userId: string,
  cutoff: Date | null,
): boolean {
  if (m.hides?.some((h) => h.userId === userId)) return true;
  return cutoff !== null && m.createdAt <= cutoff;
}

export type DeleteScope = "me" | "everyone";

export function isDeleteScope(v: unknown): v is DeleteScope {
  return v === "me" || v === "everyone";
}

export function deleteEntryMode(a: {
  deleteEnabled: boolean;
  isPro: boolean;
  canBuy: boolean;
}): "use" | "upsell" | null {
  if (!a.deleteEnabled) return null;
  if (a.isPro) return "use";
  return a.canBuy ? "upsell" : null;
}
