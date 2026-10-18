import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { rateLimitDb } from "@/lib/rate-limit-db";
import { sendSms } from "@/lib/sms";
import { sendOtpSchema, normalizePhone } from "@/lib/validations/auth";
import { getMaintenanceState, isRegistrationOpen } from "@/lib/settings";
import { TEST_OTP, hasFixedOtp } from "@/lib/test-accounts";

// Fixed OTP for test numbers — bypass SMS (list and EXTRA_TEST_PHONES in lib/test-accounts)

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
        { error: "تم تجاوز الحد المسموح من هذا الجهاز. حاول مرة أخرى بعد 15 دقيقة." },
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
        { error: "تم تجاوز الحد المسموح. حاول مرة أخرى بعد 5 دقائق." },
        { status: 429 }
      );
    }

    // Check if user already exists
    const existingUserForGate = await db.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    // If called from register context and phone is already registered,
    // return immediately without generating or sending OTP
    const context = body.context;
    if (context === "register" && existingUserForGate) {
      return NextResponse.json({
        message: "رقم الهاتف مسجل مسبقاً",
        userExists: true,
      });
    }

    // If phone is new and registration is closed, block OTP
    if (!existingUserForGate) {
      const regOpen = await isRegistrationOpen();
      if (!regOpen) {
        return NextResponse.json(
          { error: "التسجيل مغلق حالياً. يرجى المحاولة لاحقاً." },
          { status: 403 }
        );
      }
    }

    // Delete previous unexpired OTPs for this phone
    await db.otp.deleteMany({
      where: {
        phone,
        expiresAt: { gt: new Date() },
        verified: false,
      },
    });

    // Use fixed OTP for test number, random for everyone else
    const isTestPhone = hasFixedOtp(phone);
    const generatedCode = isTestPhone
      ? TEST_OTP
      : Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    const stored = await db.otp.create({
      data: {
        phone,
        code: generatedCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Send SMS (skip for test phone)
    if (!isTestPhone) {
      const sent = await sendSms(
        phone,
        `رمز التحقق الخاص بك في نصيبك: ${generatedCode}`
      );
      if (!sent) {
        // Don't tell the person a code is on its way when it isn't: they would wait for nothing
        console.warn(`[SMS] Failed to send OTP to ${phone}`);
        await db.otp.delete({ where: { id: stored.id } }).catch(() => {});
        return NextResponse.json(
          { error: "تعذّر إرسال رمز التحقق الآن. حاول مرة أخرى بعد دقيقة." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      message: "تم إرسال رمز التحقق",
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
