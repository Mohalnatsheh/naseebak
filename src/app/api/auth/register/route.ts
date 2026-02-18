import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: result.error.issues },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, gender, otp } = result.data;

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
