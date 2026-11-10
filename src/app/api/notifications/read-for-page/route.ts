import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationUrl } from "@/lib/notification-links";

const bodySchema = z.object({
  /** The page the member opened, e.g. "/dashboard/suggestions" or "/dashboard/chats/abc" */
  path: z.string().regex(/^\/dashboard(\/[A-Za-z0-9_-]+)*$/),
  /** true: only notices that open exactly this page (e.g. the chats list, not each chat) */
  exact: z.boolean().optional(),
});

/** Most recent unread rows looked at; older ones are cleared from the notifications page */
const SCAN_LIMIT = 200;

/**
 * Opening a page marks the notifications that lead to it as read, so the bell matches what the member
 * has already seen. Same mapping as the click target (`notificationUrl`); the query string of a target
 * (`?tab=`, `?match=`) doesn't matter.
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const { path, exact } = parsed.data;

    const unread = await db.notification.findMany({
      where: { userId: result.session.user.id, isRead: false },
      select: { id: true, type: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    });
    const ids = unread
      .filter((n) => {
        const target = notificationUrl(n.type, n.metadata).split(/[?#]/)[0];
        return exact ? target === path : target === path || target.startsWith(`${path}/`);
      })
      .map((n) => n.id);
    if (ids.length) {
      // userId again in the update: never touches someone else's rows
      await db.notification.updateMany({ where: { id: { in: ids }, userId: result.session.user.id }, data: { isRead: true } });
    }
    // The bell count after this read (PA-M6): the dashboard sets it without another unread-count call
    const unreadCount = unread.length < SCAN_LIMIT
      ? unread.length - ids.length
      : await db.notification.count({ where: { userId: result.session.user.id, isRead: false } });
    return NextResponse.json({ marked: ids.length, unreadCount });
  } catch (error) {
    console.error("Read-for-page error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
