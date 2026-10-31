import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { dismissAlert } from "@/lib/alerts";

/** I closed the popup (or tapped its button): it never shows to me again, on the app or the website */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    if (!(await dismissAlert(result.session.user.id, id))) {
      return NextResponse.json({ error: "التنبيه غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Dismiss alert error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
