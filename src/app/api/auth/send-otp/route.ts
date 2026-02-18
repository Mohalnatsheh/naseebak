import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendOtpSchema, normalizePhone } from "@/lib/validations/auth";

// Fixed OTP for test number — bypass SMS
// Phone stored as 07XXXXXXXX in DB
const TEST_PHONE = "0796922292";
const TEST_OTP = "111111";

// Convert 07XXXXXXXX to 962XXXXXXXX for Broadnet API
function toInternational(phone: string): string {
  return phone.replace(/^0/, "962");
}

async function sendSms(phone: string, text: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      user: "naseebak6",
      pass: "954N@LtoK",
      sid: "naseebak",
      mno: toInternational(phone),
      type: "1",
      text,
    });

    const res = await fetch(
      `https://gwjo1s.broadnet.me:8443/websmpp/websms?${params.toString()}`
    );

    if (!res.ok) {
      console.error(`[SMS] Broadnet returned ${res.status}:`, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("[SMS] Send error:", err);
    return false;
  }
}

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

    // Normalize phone to 07XXXXXXXX regardless of input format
    const phone = normalizePhone(result.data.phone);

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

    // Use fixed OTP for test number, random for everyone else
    const isTestPhone = phone === TEST_PHONE;
    const generatedCode = isTestPhone
      ? TEST_OTP
      : Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    await db.otp.create({
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
        console.warn(`[SMS] Failed to send OTP to ${phone}, code stored in DB`);
      }
    }

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    return NextResponse.json({
      message: "تم إرسال رمز التحقق",
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
