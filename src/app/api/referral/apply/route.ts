import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyReferralSchema } from "@/lib/validations/referral";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const validation = applyReferralSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "بيانات غير صالحة";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { code } = validation.data;

    // Check if user already used a referral code
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { referredBy: true, profile: { select: { isComplete: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (user.referredBy) {
      return NextResponse.json({ error: "لقد استخدمت رمز إحالة مسبقاً" }, { status: 400 });
    }

    // Can only apply during setup (profile not yet complete)
    if (user.profile?.isComplete) {
      return NextResponse.json({ error: "لا يمكن تطبيق رمز الإحالة بعد اكتمال الملف الشخصي" }, { status: 400 });
    }

    // Find referrer by code
    const referrer = await db.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });

    if (!referrer) {
      return NextResponse.json({ error: "رمز الإحالة غير صالح" }, { status: 404 });
    }

    // Prevent self-referral
    if (referrer.id === session.user.id) {
      return NextResponse.json({ error: "لا يمكنك استخدام رمز الإحالة الخاص بك" }, { status: 400 });
    }

    // Apply referral in a transaction
    await db.$transaction([
      db.user.update({
        where: { id: session.user.id },
        data: { referredBy: code },
      }),
      db.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: session.user.id,
        },
      }),
    ]);

    return NextResponse.json({ message: "تم تطبيق رمز الإحالة بنجاح" });
  } catch (error) {
    console.error("Referral apply error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
