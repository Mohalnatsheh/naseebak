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
    })
    .optional(),
});

/** End the chat for both sides; with a report it also blocks the other person */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { id } = await params;
    const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    await endConversation({ conversationId: id, userId: result.session.user.id, report: parsed.data.report });
    return NextResponse.json({ message: parsed.data.report ? "تم إنهاء المحادثة والإبلاغ" : "تم إنهاء المحادثة" });
  } catch (error) {
    return introErrorResponse(error, "End chat");
  }
}
