import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth";
import { countryOfPhone, isCountryCode } from "@/lib/countries";
import { getCountrySettings, resolveSmsProvider } from "@/lib/countries/settings";
import { normalizePhone } from "@/lib/validations/auth";
import { rateLimitDb } from "@/lib/rate-limit-db";
import { otpChannel, sendOtpCode, sendSms } from "@/lib/sms";
import { maskPhone } from "@/lib/sms-mock";

const bodySchema = z.object({ phone: z.string().min(6).max(20) });
const TEST_TEXT = "نصيبك: رسالة تجربة من لوحة الإدارة.";

/**
 * Admin → Countries → «Send test SMS»: one fixed, harmless text through the country's current provider to a number
 * of that country (5 per admin per hour). Answers whether the provider accepted it — never credentials or the
 * provider's raw reply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const code = (await params).code.toUpperCase();
    if (!isCountryCode(code)) return NextResponse.json({ error: "Unknown country" }, { status: 404 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a phone number" }, { status: 400 });
    const phone = normalizePhone(parsed.data.phone, code);
    if (countryOfPhone(phone) !== code) return NextResponse.json({ error: `The number must be a ${code} number` }, { status: 400 });

    const limit = await rateLimitDb(`admin-test-sms:${result.session.user.id}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.success) return NextResponse.json({ error: "Too many test messages. Try again later." }, { status: 429 });

    const provider = resolveSmsProvider(code, (await getCountrySettings(code)).smsProvider);
    // Where codes go by WhatsApp the test is a real sign-in code (never logged or returned)
    if ((await otpChannel(phone)) === "whatsapp") {
      const sent = await sendOtpCode(phone, String(randomInt(100000, 1000000)));
      console.log(`[admin countries] test code ${code} by ${result.session.user.id} to ${maskPhone(phone)}: channel=whatsapp sent=${sent}`);
      return NextResponse.json({ sent, provider: "WHATSAPP", to: maskPhone(phone), message: "A real sign-in code was sent by WhatsApp." });
    }
    const sent = await sendSms(phone, TEST_TEXT);
    console.log(`[admin countries] test SMS ${code} by ${result.session.user.id} to ${maskPhone(phone)}: provider=${provider} sent=${sent}`);
    return NextResponse.json({ sent, provider, to: maskPhone(phone) });
  } catch (error) {
    console.error("[admin countries] test SMS failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
