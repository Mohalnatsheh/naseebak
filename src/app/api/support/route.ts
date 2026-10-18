import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTicketSchema } from "@/lib/validations/support";
import { parsePagination } from "@/lib/utils";
import { sendAdminAlert } from "@/lib/admin-alert";

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

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

    // Best-effort admin email; never blocks or fails the request (sendAdminAlert never throws)
    void sendAdminAlert(
      "تذكرة دعم جديدة",
      [
        `العضو: ${session.user.name ?? ""} (${session.user.id})`,
        `النوع: ${parsed.data.type}`,
        `العنوان: ${parsed.data.subject}`,
        `التفاصيل: ${parsed.data.description}`,
        `Admin → Support (ticket ${ticket.id})`,
      ].join("\n")
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("Support ticket create error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    const where = { userId: session.user.id };

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.supportTicket.count({ where }),
    ]);

    return NextResponse.json({ tickets, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (error) {
    console.error("Support ticket list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
