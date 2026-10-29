import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mobileMe } from "@/lib/mobile-me";

/** The signed-in member (cookie or Bearer token): account state, country, credits, setup progress. */
export async function GET() {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) return result.error;
    const me = await mobileMe(result.session.user.id);
    if (!me) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    return NextResponse.json({ user: me });
  } catch (error) {
    console.error("[mobile] me failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
