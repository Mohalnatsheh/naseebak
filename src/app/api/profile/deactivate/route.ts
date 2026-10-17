import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { closeActivityForLeaving } from "@/lib/matches/leave";

export async function POST() {
  try {
    // Deactivated users may toggle back (same as POST /api/profile/reactivate, minus the notice)
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const { session } = result;

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isDeactivated: true },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const newStatus = !user.isDeactivated;

    await db.user.update({
      where: { id: session.user.id },
      data: { isDeactivated: newStatus },
    });
    // Pausing: end open chats and pending requests, so partners aren't left waiting
    if (newStatus) await closeActivityForLeaving(session.user.id, "paused").catch((e) => console.error("Leave cleanup error:", e));

    return NextResponse.json({
      message: newStatus ? "تم تعطيل الحساب بنجاح" : "تم تفعيل الحساب بنجاح",
      isDeactivated: newStatus,
    });
  } catch (error) {
    console.error("Deactivation error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
