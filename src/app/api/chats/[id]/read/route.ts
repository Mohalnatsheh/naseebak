import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { markRead } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";
import { db } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { upTo?: unknown } | null;
    const upTo = typeof body?.upTo === "string" ? body.upTo : undefined;
    const marked = await markRead(id, result.session.user.id, upTo);
    // The bell count after this read (PA-M6): the dashboard sets it without fetching /api/notifications/unread-count
    const unreadCount = await db.notification.count({ where: { userId: result.session.user.id, isRead: false } });
    return NextResponse.json({ marked, unreadCount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return introErrorResponse(error, "Mark chat read");
  }
}
