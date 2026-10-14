import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visitFeedbackSchema } from "@/lib/validations/visit-feedback";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { visitId } = await params;
    const body = await request.json();

    const validation = visitFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    // Verify visit exists and is COMPLETED
    const visit = await db.visitRequest.findUnique({
      where: { id: visitId },
      include: {
        match: {
          select: { femaleId: true, maleId: true },
        },
      },
    });

    if (!visit) {
      return NextResponse.json({ error: "الزيارة غير موجودة" }, { status: 404 });
    }

    if (visit.status !== "COMPLETED") {
      return NextResponse.json({ error: "لا يمكن تقييم زيارة لم تكتمل بعد" }, { status: 400 });
    }

    // Verify user is one of the match parties
    const isParty = visit.match.femaleId === session.user.id || visit.match.maleId === session.user.id;
    if (!isParty) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    // Check if feedback already exists
    const existing = await db.visitFeedback.findUnique({
      where: { visitId_userId: { visitId, userId: session.user.id } },
    });
    if (existing) {
      return NextResponse.json({ error: "لقد قمت بتقييم هذه الزيارة مسبقاً" }, { status: 409 });
    }

    const feedback = await db.visitFeedback.create({
      data: {
        visitId,
        userId: session.user.id,
        outcome: validation.data.outcome,
        reason: validation.data.reason || null,
        rating: validation.data.rating,
      },
    });

    // Check if both feedbacks now exist → notify admin
    const feedbackCount = await db.visitFeedback.count({ where: { visitId } });
    if (feedbackCount === 2) {
      // Create admin notification
      const admins = await db.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            type: "SYSTEM",
            title: "تقييم زيارة مكتمل",
            body: "تم استلام تقييم من كلا الطرفين لزيارة مكتملة",
          },
        });
      }
    }

    return NextResponse.json({ message: "تم إرسال التقييم بنجاح", feedback });
  } catch (error) {
    console.error("Visit feedback POST error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { visitId } = await params;

    const feedback = await db.visitFeedback.findUnique({
      where: { visitId_userId: { visitId, userId: session.user.id } },
    });

    return NextResponse.json({ feedback: feedback || null });
  } catch (error) {
    console.error("Visit feedback GET error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
