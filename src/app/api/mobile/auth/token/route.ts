import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { CredentialsSignin } from "next-auth";
import { authorizePhoneLogin } from "@/lib/auth-authorize";
import { createMobileSession } from "@/lib/mobile-auth";
import { RATE_LIMITED_CODE } from "@/lib/login-limit";
import { getMaintenanceState } from "@/lib/settings";
import { mobileMe } from "@/lib/mobile-me";

const bodySchema = z.object({
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(10),
  /** Free text from the app, e.g. "android 15 · Pixel 8" */
  device: z.string().max(120).optional(),
});

/**
 * Mobile sign-in: a phone + a code verified by `/api/auth/verify-otp` (sent within 30 minutes) → a Bearer token.
 * Same check, limits and single use as the web sign-in (`authorizePhoneLogin`: 5 failures per 15 minutes, the code is
 * used up). Also the step right after `/api/auth/register`. Admins can't get a token.
 */
export async function POST(request: Request) {
  try {
    if ((await getMaintenanceState()).enabled) {
      return NextResponse.json({ error: "الموقع تحت الصيانة حالياً. يرجى المحاولة لاحقاً.", code: "MAINTENANCE" }, { status: 503 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة", code: "INVALID" }, { status: 400 });

    let user;
    try {
      user = await authorizePhoneLogin({ phone: parsed.data.phone, otp: parsed.data.code });
    } catch (error) {
      if (error instanceof CredentialsSignin && error.code?.startsWith(RATE_LIMITED_CODE)) {
        const minutes = Number(error.code.split(":")[1]) || 15;
        return NextResponse.json(
          { error: `محاولات كثيرة غير ناجحة. يمكنك المحاولة مرة أخرى بعد ${minutes} دقيقة.`, code: "RATE_LIMITED", retryAfterMinutes: minutes },
          { status: 429 },
        );
      }
      throw error;
    }
    if (!user || user.role !== "USER") {
      return NextResponse.json({ error: "رمز التحقق غير صالح أو انتهت صلاحيته", code: "INVALID_CODE" }, { status: 401 });
    }

    const { token, expiresAt } = await createMobileSession(user.id, parsed.data.device);
    return NextResponse.json({ token, expiresAt, user: await mobileMe(user.id) }, { status: 201 });
  } catch (error) {
    console.error("[mobile auth] token failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
