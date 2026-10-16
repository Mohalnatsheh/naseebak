import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    if (id === "all") {
      await db.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ message: "تم تحديث جميع الإشعارات" });
    }

    const updated = await db.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { isRead: true },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "الإشعار غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ message: "تم تحديث الإشعار" });
  } catch (error) {
    console.error("Mark read error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    // Verify ownership before deleting
    const notification = await db.notification.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!notification) {
      return NextResponse.json({ error: "الإشعار غير موجود" }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });

    return NextResponse.json({ message: "تم حذف الإشعار" });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
