import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { closeActivityForLeaving } from "@/lib/matches/leave";

/**
 * POST { action: "pause" | "resume" } — explicit, never a toggle (a stale tab must not wake an
 * account that is scheduled for deletion). No body = "pause" (older clients only ever paused).
 * "resume" also cancels a pending deletion request, like POST /api/profile/reactivate.
 */
export async function POST(request: Request) {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const userId = result.session.user.id;

    const body = await request.json().catch(() => ({}));
    const action = body && typeof body === "object" && "action" in body ? body.action : "pause";
    if (action !== "pause" && action !== "resume") {
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isDeactivated: true },
    });
    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (action === "pause") {
      if (user.isDeactivated) {
        return NextResponse.json({ message: "حسابك معطّل بالفعل", isDeactivated: true });
      }
      await db.user.update({ where: { id: userId }, data: { isDeactivated: true } });
      // Pausing: end open chats and pending requests, so partners aren't left waiting
      await closeActivityForLeaving(userId, "paused").catch((e) => console.error("Leave cleanup error:", e));
      return NextResponse.json({ message: "تم تعطيل الحساب بنجاح", isDeactivated: true });
    }

    // resume
    const pending = await db.accountDeletionRequest.findUnique({ where: { userId } });
    const hasPendingDeletion = !!pending && !pending.cancelledAt;
    if (!user.isDeactivated && !hasPendingDeletion) {
      return NextResponse.json({ message: "حسابك مفعّل بالفعل", isDeactivated: false });
    }
    await db.$transaction(async (tx) => {
      if (hasPendingDeletion) {
        await tx.accountDeletionRequest.update({ where: { userId }, data: { cancelledAt: new Date() } });
      }
      await tx.user.update({ where: { id: userId }, data: { isDeactivated: false } });
    });
    return NextResponse.json({
      message: "تم تفعيل الحساب بنجاح",
      isDeactivated: false,
      cancelledDeletion: hasPendingDeletion,
    });
  } catch (error) {
    console.error("Deactivation error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
