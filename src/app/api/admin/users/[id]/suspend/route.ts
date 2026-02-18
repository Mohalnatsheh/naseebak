import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;

    // Find the user
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, status: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    // Prevent suspending admins
    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "لا يمكن إيقاف حساب مسؤول" }, { status: 400 });
    }

    // Toggle suspension: if SUSPENDED -> VERIFIED, otherwise -> SUSPENDED
    const newStatus = user.status === "SUSPENDED" ? "VERIFIED" : "SUSPENDED";

    const updatedUser = await db.user.update({
      where: { id },
      data: { status: newStatus },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    });

    // Notify the user
    const notifTitle = newStatus === "SUSPENDED" ? "تم إيقاف حسابك" : "تم إعادة تفعيل حسابك";
    const notifBody = newStatus === "SUSPENDED"
      ? "تم إيقاف حسابك من قبل الإدارة. يرجى التواصل مع الدعم لمزيد من المعلومات."
      : "تم إعادة تفعيل حسابك بنجاح. يمكنك الآن استخدام المنصة.";

    await db.notification.create({
      data: {
        userId: id,
        type: "SYSTEM",
        title: notifTitle,
        body: notifBody,
      },
    });

    // Push notification
    sendPushNotification({
      userId: id,
      title: notifTitle,
      body: notifBody,
      url: "/dashboard",
    });

    return NextResponse.json({
      message: newStatus === "SUSPENDED" ? "تم إيقاف الحساب" : "تم إعادة تفعيل الحساب",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Admin suspend error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
