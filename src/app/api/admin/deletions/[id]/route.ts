import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { id } = await params;

    const request = await db.accountDeletionRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, cancelledAt: true },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.cancelledAt) {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    const cancelled = await db.$transaction(async (tx) => {
      // cancelledAt: null guard so two admins cancelling at once only reactivate/notify once
      const res = await tx.accountDeletionRequest.updateMany({
        where: { id, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (res.count !== 1) return false;
      await tx.user.update({
        where: { id: request.userId },
        data: { isDeactivated: false },
      });
      return true;
    });

    if (!cancelled) {
      return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
    }

    await notify({
      userId: request.userId,
      type: "SYSTEM",
      title: "تم إلغاء طلب حذف حسابك",
      body: "قامت الإدارة بإلغاء طلب حذف حسابك وأُعيد تفعيله. يمكنك متابعة استخدام نصيبك كالمعتاد.",
      url: "/dashboard",
    });

    return NextResponse.json({ message: "Deletion request cancelled, account reactivated" });
  } catch (error) {
    console.error("Admin deletion cancel error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
