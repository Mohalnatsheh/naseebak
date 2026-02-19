import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;

    const block = await db.block.findUnique({
      where: { id },
    });

    if (!block || block.blockerId !== session.user.id) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    await db.block.delete({ where: { id } });

    return NextResponse.json({ message: "تم إلغاء الحظر بنجاح" });
  } catch (error) {
    console.error("Unblock error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
