import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { rateLimitDb } from "@/lib/rate-limit-db";
import { otpChannel, sendOtpCode } from "@/lib/sms";
import { sendOtpSchema, normalizePhone } from "@/lib/validations/auth";
import { getMaintenanceState, isRegistrationOpen } from "@/lib/settings";
import { countrySignupBlock } from "@/lib/countries/settings";
import { TEST_OTP, hasFixedOtp } from "@/lib/test-accounts";
import { fixedOtpOverride } from "@/lib/otp-overrides";

// Fixed OTP, SMS bypassed: test numbers (EXTRA_TEST_PHONES) use TEST_OTP; a per-number override
// (FIXED_OTP_OVERRIDES, a real member, not the test group) uses its own code. See lib/otp-overrides.

export async function POST(request: Request) {
  try {
    // IP-based rate limit: 10 OTP requests per IP per 15 minutes
    const ip = clientIp(request);
    const { success: ipAllowed } = await rateLimitDb(`otp-ip:${ip}`, {
      maxAttempts: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!ipAllowed) {
      return NextResponse.json(
        { error: "تم تجاوز الحد المسموح من هذا الجهاز. يمكنك المحاولة مرة أخرى بعد 15 دقيقة." },
        { status: 429 }
      );
    }

    if ((await getMaintenanceState()).enabled) {
      return NextResponse.json({ error: "الموقع تحت الصيانة حالياً. يرجى المحاولة لاحقاً." }, { status: 503 });
    }

    const body = await request.json();
    const result = sendOtpSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: result.error.issues },
        { status: 400 }
      );
    }

    // Normalize phone to 962XXXXXXXXX regardless of input format
    const phone = normalizePhone(result.data.phone);

    // Rate limit: 3 OTP requests per phone per 5 minutes
    const { success } = await rateLimitDb(`otp:${phone}`, {
      maxAttempts: 3,
      windowMs: 5 * 60 * 1000,
    });

    if (!success) {
      return NextResponse.json(
        { error: "تم تجاوز الحد المسموح. يمكنك المحاولة مرة أخرى بعد 5 دقائق." },
        { status: 429 }
      );
    }

    // Check if user already exists
    const existingUserForGate = await db.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    // Sign-up never tells whether a number is registered (anyone could test numbers on a marriage
    // site): the code is always sent and the answer is the same. Only a verified code reveals it
    // (POST /api/auth/register → 409 PHONE_EXISTS, and the register page signs the member in).
    const forRegister = body.context === "register";

    // Registration closed: block OTP for new numbers (for sign-up, for every number, so the
    // answer doesn't depend on whether the number exists)
    if (forRegister || !existingUserForGate) {
      const regOpen = await isRegistrationOpen();
      if (!regOpen) {
        return NextResponse.json(
          { error: "التسجيل مغلق حالياً. يرجى المحاولة لاحقاً." },
          { status: 403 }
        );
      }
      // The number's country must be open for sign-up (same answer whether or not the number exists)
      const blocked = await countrySignupBlock(phone, typeof body.country === "string" ? body.country : null);
      if (blocked) return NextResponse.json({ error: blocked.error, code: blocked.code }, { status: blocked.status });
    }

    // Delete previous unexpired OTPs for this phone
    await db.otp.deleteMany({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        verified: false,
      },
    });

    // A per-number override (real member, own code) wins; otherwise test numbers use TEST_OTP,
    // everyone else a random code. A fixed code (either kind) skips the SMS.
    const fixedCode = fixedOtpOverride(phone) ?? (hasFixedOtp(phone) ? TEST_OTP : null);
    const skipSms = fixedCode !== null;
    const generatedCode = fixedCode ?? Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    const stored = await db.otp.create({
      data: {
        phone,
        code: generatedCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Send SMS (skip when the code is fixed)
    if (!skipSms) {
      const sent = await sendOtpCode(phone, generatedCode);
      if (!sent) {
        // Don't tell the person a code is on its way when it isn't: they would wait for nothing
        console.warn(`[SMS] Failed to send OTP to ${phone}`);
        await db.otp.delete({ where: { id: stored.id } }).catch(() => {});
        return NextResponse.json(
          { error: "تعذّر إرسال رمز التحقق الآن. يمكنك المحاولة مرة أخرى بعد دقيقة." },
          { status: 502 }
        );
      }
    }

    const channel = await otpChannel(phone);
    if (forRegister) return NextResponse.json({ message: "تم إرسال رمز التحقق", channel });
    // Kept only for app builds made before 2026-11-07, which decide «sign in» or «sign up» from it before the code is
    // checked. The website and newer app builds read it from /api/auth/verify-otp instead. Remove it (closing the
    // "is this number registered?" check) once the force-update switch requires the newer app.
    return NextResponse.json({
      message: "تم إرسال رمز التحقق",
      channel,
      userExists: !!existingUserForGate,
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم" },
      { status: 500 }
    );
  }
}
