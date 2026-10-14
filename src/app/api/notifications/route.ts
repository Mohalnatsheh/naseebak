import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 20);

    const where = { userId: session.user.id };

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.notification.count({ where }),
      db.notification.count({
        where: { userId: session.user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({
      notifications,
      unreadCount,
      page,
      totalPages: Math.ceil(total / pageSize),
      total,
    });
  } catch (error) {
    console.error("Notifications error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    await db.notification.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ message: "تم حذف جميع الإشعارات" });
  } catch (error) {
    console.error("Delete all notifications error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
