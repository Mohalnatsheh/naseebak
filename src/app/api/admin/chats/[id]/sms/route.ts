import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendUnreadSmsNow } from "@/lib/chat/unread-sms";

/** «أرسل SMS الآن»: text whoever has unread messages in this chat (no daily cap / push check). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { id } = await params;
    const r = await sendUnreadSmsNow(id, result.session.user.id);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === "not_found" ? 404 : 409 });
    return NextResponse.json(r);
  } catch (error) {
    console.error("Admin chat SMS error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
