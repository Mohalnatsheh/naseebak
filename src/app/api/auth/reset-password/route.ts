import { NextResponse } from "next/server";

// Password reset is no longer supported - auth is OTP-based
export async function POST() {
  return NextResponse.json(
    { error: "نظام المصادقة يعتمد على رمز التحقق. لا حاجة لإعادة تعيين كلمة المرور." },
    { status: 410 }
  );
}
