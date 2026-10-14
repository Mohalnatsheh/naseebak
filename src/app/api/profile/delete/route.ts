import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST — Request account deletion (30-day grace period)
 * DELETE — Cancel pending deletion request
 * GET — Check deletion status
 */

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    // Check if already has a pending request
    const existing = await db.accountDeletionRequest.findUnique({
      where: { userId: session.user.id },
    });

    if (existing && !existing.cancelledAt) {
      return NextResponse.json({
        message: "لديك طلب حذف قائم بالفعل",
        deletionRequest: existing,
      });
    }

    const body = await request.json().catch(() => ({}));

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    // Upsert: create or update if previously cancelled
    const deletionRequest = await db.accountDeletionRequest.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        reason: body.reason || null,
        scheduledAt,
      },
      update: {
        reason: body.reason || null,
        scheduledAt,
        cancelledAt: null,
      },
    });

    // Deactivate account immediately
    await db.user.update({
      where: { id: session.user.id },
      data: { isDeactivated: true },
    });

    return NextResponse.json({
      message: "تم تقديم طلب حذف الحساب. سيتم حذف الحساب نهائياً بعد 30 يوماً.",
      deletionRequest,
    });
  } catch (error) {
    console.error("Delete request error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const existing = await db.accountDeletionRequest.findUnique({
      where: { userId: session.user.id },
    });

    if (!existing || existing.cancelledAt) {
      return NextResponse.json({ error: "لا يوجد طلب حذف قائم" }, { status: 404 });
    }

    // Cancel the deletion request
    await db.accountDeletionRequest.update({
      where: { userId: session.user.id },
      data: { cancelledAt: new Date() },
    });

    // Reactivate account
    await db.user.update({
      where: { id: session.user.id },
      data: { isDeactivated: false },
    });

    return NextResponse.json({ message: "تم إلغاء طلب حذف الحساب وتفعيل الحساب مجدداً" });
  } catch (error) {
    console.error("Cancel delete error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const deletionRequest = await db.accountDeletionRequest.findUnique({
      where: { userId: session.user.id },
    });

    if (!deletionRequest || deletionRequest.cancelledAt) {
      return NextResponse.json({ hasPendingDeletion: false });
    }

    return NextResponse.json({
      hasPendingDeletion: true,
      deletionRequest,
    });
  } catch (error) {
    console.error("Delete status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
