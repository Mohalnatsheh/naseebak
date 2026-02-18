import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendOtpSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = sendOtpSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: result.error.issues },
        { status: 400 }
      );
    }

    const { phone } = result.data;

    // Rate limit: 3 OTP requests per phone per 5 minutes
    const { success } = rateLimit(`otp:${phone}`, {
      maxAttempts: 3,
      windowMs: 5 * 60 * 1000,
    });

    if (!success) {
      return NextResponse.json(
        { error: "تم تجاوز الحد المسموح. حاول مرة أخرى بعد 5 دقائق." },
        { status: 429 }
      );
    }

    // Delete previous unexpired OTPs for this phone
    await db.otp.deleteMany({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        verified: false,
      },
    });

    // Generate 6-digit OTP
    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    await db.otp.create({
      data: {
        phone,
        code: generatedCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Check if user exists (used by login page to avoid redirect-to-register for existing users)
    const existingUser = await db.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    // Mock mode: return OTP in response for development
    return NextResponse.json({
      message: "تم إرسال رمز التحقق",
      otp: generatedCode,
      userExists: !!existingUser,
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}
