import { NextResponse } from "next/server";
import { bearerToken, revokeMobileToken } from "@/lib/mobile-auth";

/** Mobile logout: the Bearer token stops working at once. Always 200 (an unknown token is already signed out). */
export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (token) await revokeMobileToken(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mobile auth] logout failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
