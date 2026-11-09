import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const NO_PRO_ERROR = "لا يوجد اشتراك Pro فعّال.";
export const PRO_MANAGE_FAILED = "تعذّر تحديث الاشتراك الآن. حاول مرة أخرى بعد قليل.";

/** POST /api/pro/cancel and /api/pro/resume (website session or app Bearer) */
export async function manageProRoute(action: (userId: string) => Promise<"ok" | "none">, cancelAtPeriodEnd: boolean) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  try {
    const outcome = await action(result.session.user.id);
    if (outcome === "none") return NextResponse.json({ error: NO_PRO_ERROR }, { status: 404 });
    return NextResponse.json({ ok: true, cancelAtPeriodEnd });
  } catch (e) {
    console.error("[pro] cancel/resume failed", result.session.user.id, e);
    return NextResponse.json({ error: PRO_MANAGE_FAILED }, { status: 502 });
  }
}
