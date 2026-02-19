import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const body = await request.json();
    const { recipientId, candidateId, compatibilityScore } = body;

    if (!recipientId || !candidateId) {
      return NextResponse.json({ error: "كلا المستخدمين مطلوبان" }, { status: 400 });
    }

    const suggestion = await db.suggestion.create({
      data: {
        recipientId,
        candidateId,
        compatibilityScore: compatibilityScore || 85,
        source: "ADMIN",
      },
    });

    // Notify the recipient
    await db.notification.create({
      data: {
        userId: recipientId,
        type: "SUGGESTION",
        title: "اقتراح جديد من الإدارة",
        body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
      },
    });

    // Push notification
    sendPushNotification({
      userId: recipientId,
      title: "اقتراح جديد من الإدارة",
      body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
      url: "/dashboard/suggestions",
    });

    return NextResponse.json({ message: "تم إنشاء الاقتراح", suggestion });
  } catch (error) {
    console.error("Admin suggestion error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
