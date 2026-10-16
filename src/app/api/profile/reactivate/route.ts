import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

/**
 * POST — reactivate the signed-in user's account: clears `isDeactivated` and cancels a
 * pending deletion request (30-day grace period). Suspended users stay refused by requireUser.
 */
export async function POST() {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const userId = result.session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isDeactivated: true },
    });
    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const pending = await db.accountDeletionRequest.findUnique({ where: { userId } });
    const hasPendingDeletion = !!pending && !pending.cancelledAt;

    if (!user.isDeactivated && !hasPendingDeletion) {
      return NextResponse.json({ message: "حسابك مفعّل بالفعل", reactivated: false });
    }

    await db.$transaction(async (tx) => {
      if (hasPendingDeletion) {
        await tx.accountDeletionRequest.update({
          where: { userId },
          data: { cancelledAt: new Date() },
        });
      }
      await tx.user.update({ where: { id: userId }, data: { isDeactivated: false } });
    });

    await notify({
      userId,
      type: "SYSTEM",
      title: "تم إعادة تفعيل حسابك",
      body: hasPendingDeletion
        ? "أُلغي طلب حذف حسابك وعاد حسابك مفعّلاً. يسعدنا وجودك معنا من جديد."
        : "عاد حسابك مفعّلاً ويمكنك متابعة رحلتك على نصيبك.",
      url: "/dashboard",
    });

    return NextResponse.json({
      message: "تم إعادة تفعيل حسابك",
      reactivated: true,
      cancelledDeletion: hasPendingDeletion,
    });
  } catch (error) {
    console.error("Reactivate error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
