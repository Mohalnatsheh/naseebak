import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT() {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) return authResult.error;
    const { session } = authResult;

    const result = await db.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({
      message: "تم تحديث جميع الإشعارات كمقروءة",
      updatedCount: result.count,
    });
  } catch (error) {
    console.error("Mark all read error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
