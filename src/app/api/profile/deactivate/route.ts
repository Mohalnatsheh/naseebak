import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

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

    return NextResponse.json({
      message: newStatus ? "تم تعطيل الحساب بنجاح" : "تم تفعيل الحساب بنجاح",
      isDeactivated: newStatus,
    });
  } catch (error) {
    console.error("Deactivation error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
