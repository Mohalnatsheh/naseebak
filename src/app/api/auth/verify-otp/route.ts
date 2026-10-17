import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyOtpSchema, normalizePhone } from "@/lib/validations/auth";
import { rateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
/** Wrong guesses allowed per phone before the code is thrown away (a new one must be requested) */
const MAX_TRIES_PER_PHONE = 5;
const MAX_TRIES_PER_IP = 30;

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

    // Stop code guessing: per phone and per IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const byIp = rateLimit(`verify-otp-ip:${ip}`, { maxAttempts: MAX_TRIES_PER_IP, windowMs: WINDOW_MS });
    const byPhone = rateLimit(`verify-otp:${phone}`, { maxAttempts: MAX_TRIES_PER_PHONE, windowMs: WINDOW_MS });
    if (!byIp.success || !byPhone.success) {
      // Too many tries: the current code is no longer usable even if guessed later
      if (!byPhone.success) await db.otp.deleteMany({ where: { phone, verified: false } });
      return NextResponse.json(
        { error: "محاولات كثيرة. اطلب رمزاً جديداً بعد 15 دقيقة." },
        { status: 429 }
      );
    }

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
