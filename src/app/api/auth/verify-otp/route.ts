import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyOtpSchema, normalizePhone } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = verifyOtpSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: result.error.issues },
        { status: 400 }
      );
    }

    const phone = normalizePhone(result.data.phone);
    const { code } = result.data;

    // Find OTP: must exist, not expired, not already verified
    const otp = await db.otp.findFirst({
      where: {
        phone,
        code,
        expiresAt: { gt: new Date() },
        verified: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json(
        { error: "رمز التحقق غير صالح أو منتهي الصلاحية" },
        { status: 400 }
      );
    }

    // Mark OTP as verified
    await db.otp.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}
