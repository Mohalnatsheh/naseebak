import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const { reportedId, reason, details } = body;

    if (!reportedId || !reason) {
      return NextResponse.json({ error: "البيانات غير مكتملة" }, { status: 400 });
    }

    const validReasons = ["FAKE_PROFILE", "INAPPROPRIATE_CONTENT", "HARASSMENT", "SPAM", "OTHER"];
    if (!validReasons.includes(reason)) {
      return NextResponse.json({ error: "سبب البلاغ غير صالح" }, { status: 400 });
    }

    if (reportedId === session.user.id) {
      return NextResponse.json({ error: "لا يمكنك الإبلاغ عن نفسك" }, { status: 400 });
    }

    // Check for existing report
    const existing = await db.report.findUnique({
      where: {
        reporterId_reportedId: {
          reporterId: session.user.id,
          reportedId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "لقد قمت بالإبلاغ عن هذا المستخدم مسبقاً" }, { status: 409 });
    }

    const report = await db.report.create({
      data: {
        reporterId: session.user.id,
        reportedId,
        reason,
        details: details || null,
      },
    });

    // Auto-flag user if they have 3+ reports
    const reportCount = await db.report.count({
      where: {
        reportedId,
        status: { in: ["PENDING", "REVIEWED"] },
      },
    });
    if (reportCount >= 3) {
      await db.user.update({
        where: { id: reportedId },
        data: {
          isFlagged: true,
          flagReason: `Auto-flagged: ${reportCount} reports from different users`,
        },
      });
    }

    return NextResponse.json({ message: "تم إرسال البلاغ بنجاح", report });
  } catch (error) {
    console.error("Report error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
