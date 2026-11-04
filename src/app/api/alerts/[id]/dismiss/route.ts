import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ALERT_ACTIONS, dismissAlert, type AlertAction } from "@/lib/alerts";

/** I closed the popup (or tapped its button): it never shows to me again, on the app or the website. Body (website): `{ action: "TAPPED" | "CLOSED" }` */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = (ALERT_ACTIONS as readonly unknown[]).includes(body?.action) ? (body!.action as AlertAction) : null;
    if (!(await dismissAlert(result.session.user.id, id, action))) {
      return NextResponse.json({ error: "التنبيه غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Dismiss alert error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
