import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateNotificationPreferencesSchema } from "@/lib/validations/notification-preferences";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const preferences = await db.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Notification preferences GET error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateNotificationPreferencesSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const preferences = await db.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...validation.data },
      update: validation.data,
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Notification preferences PATCH error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
