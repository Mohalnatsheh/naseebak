import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST — «سحب الطلب»: the member withdraws their pending profile review request.
 * Status becomes "WITHDRAWN" (kept for the record; Admin → Profile Requests lists only PENDING, and
 * the admin review is guarded by `status: "PENDING"`, so a withdrawn request can't be approved).
 */
export async function POST() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;

    const { count } = await db.profileUpdateRequest.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "WITHDRAWN" },
    });
    if (count === 0) {
      return NextResponse.json({ error: "لا يوجد طلب تعديل قيد المراجعة" }, { status: 404 });
    }
    return NextResponse.json({ message: "تم سحب طلب التعديل", withdrawn: true });
  } catch (error) {
    console.error("Profile update request withdraw error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
