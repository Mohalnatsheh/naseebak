import { notify } from "@/lib/notify";
import type { NotificationType } from "@prisma/client";

/**
 * Kept for existing callers — delegates to notify(), which stores the in-app
 * notification and sends push only when the user's preference allows it.
 */
export async function createNotificationIfAllowed(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  pushUrl?: string,
) {
  await notify({ userId, type, title, body, metadata, url: pushUrl });
}
