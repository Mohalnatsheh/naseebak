import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mobileMe } from "@/lib/mobile-me";
import { recordActivityDay } from "@/lib/activity-days";

/**
 * The signed-in member (cookie or Bearer token): account state, country, credits, setup progress, a pending
 * deletion. A suspended account answers 403 `SUSPENDED`.
 */
export async function GET() {
  try {
    const result = await requireUser({ allowDeactivated: true });
    if ("error" in result) {
      // With paused accounts let through, a 403 here only means a suspension: give the app a code to show it
      if (result.error.status === 403) {
        return NextResponse.json({ error: "تم إيقاف حسابك", code: "SUSPENDED" }, { status: 403 });
      }
      return result.error;
    }
    // The app reads this on every start and resume: counts the day for «Active by device»
    await recordActivityDay(result.session.user.id);
    const me = await mobileMe(result.session.user.id);
    if (!me) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    return NextResponse.json({ user: me });
  } catch (error) {
    console.error("[mobile] me failed:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
