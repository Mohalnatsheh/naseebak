import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerSchema, normalizePhone, VERIFIED_OTP_WINDOW_MS } from "@/lib/validations/auth";
import { getMaintenanceState, isRegistrationOpen } from "@/lib/settings";
import { getRegistrationCredits, recordCredit } from "@/lib/credits";
import { sendNewUserNotification } from "@/lib/email";

export async function POST(request: Request) {
  try {
    if ((await getMaintenanceState()).enabled) {
      return NextResponse.json({ error: "الموقع تحت الصيانة حالياً. يرجى المحاولة لاحقاً." }, { status: 503 });
    }

    // Check if registration is open
    const open = await isRegistrationOpen();
    if (!open) {
      return NextResponse.json(
        { error: "التسجيل مغلق حالياً. يرجى المحاولة لاحقاً." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: result.error.issues },
        { status: 400 }
      );
    }

    const { firstName, lastName, gender, otp } = result.data;
    const phone = normalizePhone(result.data.phone);

    // A code verified by /api/auth/verify-otp within the last 30 minutes (login → register
    // hand-off included). Sign-in right after registering uses it up.
    const verifiedOtp = await db.otp.findFirst({
      where: {
        phone,
        code: otp,
        verified: true,
        createdAt: { gt: new Date(Date.now() - VERIFIED_OTP_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verifiedOtp) {
      return NextResponse.json(
        { error: "رمز التحقق غير صالح أو منتهي الصلاحية" },
        { status: 400 }
      );
    }

    // Check phone uniqueness
    const existingByPhone = await db.user.findUnique({ where: { phone } });
    if (existingByPhone) {
      return NextResponse.json(
        { error: "رقم الهاتف مسجل مسبقاً" },
        { status: 409 }
      );
    }

    // Create user with phone-based email placeholder
    const registrationCredits = await getRegistrationCredits();
    const user = await db.user.create({
      data: {
        firstName,
        lastName,
        email: `phone_${phone}@naseeb.local`,
        phone,
        passwordHash: null,
        gender,
        matchCredits: registrationCredits,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        gender: true,
        createdAt: true,
      },
    });

    await recordCredit({ userId: user.id, delta: registrationCredits, reason: "REGISTRATION" });

    // Notify admin by email — fire-and-forget so SMTP delays/failures never block registration
    sendNewUserNotification({
      firstName,
      lastName,
      phone: user.phone ?? phone,
      gender: user.gender,
      createdAt: user.createdAt,
    }).catch((err) => console.error("[Email] New user notification failed:", err));

    return NextResponse.json(
      { message: "تم إنشاء الحساب بنجاح", user },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}
