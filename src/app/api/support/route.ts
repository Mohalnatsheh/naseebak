import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTicketSchema } from "@/lib/validations/support";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "بيانات غير صالحة" },
        { status: 400 }
      );
    }

    // Limit to 5 open tickets per user
    const openCount = await db.supportTicket.count({
      where: {
        userId: session.user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    if (openCount >= 5) {
      return NextResponse.json(
        { error: "لا يمكنك إرسال أكثر من 5 تذاكر مفتوحة" },
        { status: 400 }
      );
    }

    const ticket = await db.supportTicket.create({
      data: {
        userId: session.user.id,
        type: parsed.data.type,
        subject: parsed.data.subject,
        description: parsed.data.description,
      },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("Support ticket create error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const tickets = await db.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Support ticket list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
