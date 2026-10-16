import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerSchema, normalizePhone } from "@/lib/validations/auth";
import { getMaintenanceState, isRegistrationOpen } from "@/lib/settings";
import { getRegistrationCredits } from "@/lib/credits";
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

    // Verify the OTP was verified for this phone
    // Note: We don't check expiresAt here because the OTP was already verified
    // (either during registration flow or during login redirect).
    // The expiry is enforced at verification time, not at registration time.
    const verifiedOtp = await db.otp.findFirst({
      where: {
        phone,
        code: otp,
        verified: true,
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
    const user = await db.user.create({
      data: {
        firstName,
        lastName,
        email: `phone_${phone}@naseeb.local`,
        phone,
        passwordHash: null,
        gender,
        matchCredits: await getRegistrationCredits(),
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
