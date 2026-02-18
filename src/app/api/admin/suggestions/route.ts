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
    const { femaleId, maleId, compatibilityScore } = body;

    if (!femaleId || !maleId) {
      return NextResponse.json({ error: "كلا المستخدمين مطلوبان" }, { status: 400 });
    }

    const suggestion = await db.suggestion.create({
      data: {
        femaleId,
        maleId,
        compatibilityScore: compatibilityScore || 85,
        source: "ADMIN",
      },
    });

    // Notify the female user
    await db.notification.create({
      data: {
        userId: femaleId,
        type: "SUGGESTION",
        title: "اقتراح جديد من الإدارة",
        body: "لديك اقتراح توافق جديد من فريق نصيب. قومي بمراجعته.",
      },
    });

    // Push notification
    sendPushNotification({
      userId: femaleId,
      title: "اقتراح جديد من الإدارة",
      body: "لديك اقتراح توافق جديد من فريق نصيب. قومي بمراجعته.",
      url: "/dashboard/suggestions",
    });

    return NextResponse.json({ message: "تم إنشاء الاقتراح", suggestion });
  } catch (error) {
    console.error("Admin suggestion error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
