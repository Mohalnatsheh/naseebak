import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { endConversation } from "@/lib/chat/service";
import { introErrorResponse } from "@/lib/intro/http";

const schema = z.object({
  report: z
    .object({
      reason: z.enum(["FAKE_PROFILE", "INAPPROPRIATE_CONTENT", "HARASSMENT", "SPAM", "OTHER"]),
      details: z.string().max(1000).optional(),
      /** «إبلاغ عن الرسالة»: the reported message (must belong to this chat); absent from app 1.0.x */
      messageId: z.string().min(1).max(64).optional(),
    })
    .optional(),
  /** «إبلاغ فقط»: false files the report without ending the chat or blocking (needs `report`). Default true */
  end: z.boolean().optional(),
});

/**
 * End the chat for both sides; with a report it also blocks the other person.
 * `{ end: false, report }` («إبلاغ فقط») only files the report: the chat stays open and nobody is blocked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const { report, end } = parsed.data;
    if (end === false && !report) return NextResponse.json({ error: "اختر سبب البلاغ" }, { status: 400 });
    await endConversation({ conversationId: id, userId: result.session.user.id, report, end });
    const message = end === false ? "تم إرسال البلاغ" : report ? "تم إنهاء المحادثة والإبلاغ" : "تم إنهاء المحادثة";
    return NextResponse.json({ message, ended: end !== false });
  } catch (error) {
    return introErrorResponse(error, "End chat");
  }
}
