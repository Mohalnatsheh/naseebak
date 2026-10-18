import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fileReport } from "@/lib/reports";

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { reportedId, reason, details } = body;

    if (typeof reportedId !== "string" || !reportedId || !reason) {
      return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
    }
    if (details != null && (typeof details !== "string" || details.length > 1000)) {
      return NextResponse.json({ error: "تفاصيل البلاغ يجب ألا تتجاوز 1000 حرف" }, { status: 400 });
    }

    const validReasons = ["FAKE_PROFILE", "INAPPROPRIATE_CONTENT", "HARASSMENT", "SPAM", "OTHER"];
    if (!validReasons.includes(reason)) {
      return NextResponse.json({ error: "سبب البلاغ غير صالح" }, { status: 400 });
    }

    if (reportedId === session.user.id) {
      return NextResponse.json({ error: "لا يمكنك الإبلاغ عن نفسك" }, { status: 400 });
    }

    // Only someone you were shown (a suggestion) or matched with can be reported: three strangers
    // can't flag an account they never saw
    const me = session.user.id;
    const [sawSuggestion, matched] = await Promise.all([
      db.suggestion.count({
        where: { OR: [{ recipientId: me, candidateId: reportedId }, { recipientId: reportedId, candidateId: me }] },
      }),
      db.mutualMatch.count({
        where: { OR: [{ femaleId: me, maleId: reportedId }, { femaleId: reportedId, maleId: me }] },
      }),
    ]);
    if (sawSuggestion + matched === 0) {
      return NextResponse.json({ error: "لا يمكنك الإبلاغ عن هذا المستخدم" }, { status: 403 });
    }

    // A repeat report reopens the earlier one (both accounts kept) and counts toward the auto-flag
    // A chat is attached only if it is really between these two (admins open it from the report)
    const askedChat = typeof body.conversationId === "string" ? body.conversationId : null;
    const chat = askedChat
      ? await db.conversation.findFirst({
          where: {
            id: askedChat,
            match: { OR: [{ femaleId: me, maleId: reportedId }, { femaleId: reportedId, maleId: me }] },
          },
          select: { id: true },
        })
      : null;
    const conversationId = chat?.id ?? null;
    const report = await fileReport({ reporterId: me, reportedId, reason, details, conversationId });

    return NextResponse.json({ message: "تم إرسال البلاغ بنجاح", report });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
