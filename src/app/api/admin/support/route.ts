import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";

const statusLabels: Record<string, string> = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const limit = 20;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.supportTicket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      total,
      pages: Math.ceil(total / limit),
      page,
    });
  } catch (error) {
    console.error("Admin support tickets error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { ticketId, status, adminNote } = body;

    if (!ticketId || !status) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    if (!["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      status,
      adminNote: adminNote || null,
    };

    if (status === "RESOLVED" || status === "CLOSED") {
      data.resolvedAt = new Date();
    }

    const ticket = await db.supportTicket.update({
      where: { id: ticketId },
      data,
      include: {
        user: { select: { id: true, firstName: true } },
      },
    });

    // Notify the user
    const statusAr = statusLabels[status] || status;
    const notifBody = `تم تحديث حالة تذكرتك "${ticket.subject}" إلى: ${statusAr}`;

    await db.notification.create({
      data: {
        userId: ticket.userId,
        type: "SUPPORT",
        title: "تحديث تذكرة الدعم",
        body: notifBody,
      },
    });

    // Send push notification (fire-and-forget)
    sendPushNotification({
      userId: ticket.userId,
      title: "تحديث تذكرة الدعم",
      body: notifBody,
      url: "https://naseebak.com/dashboard/support",
    }).catch(() => {});

    return NextResponse.json({ message: "Ticket updated", ticket });
  } catch (error) {
    console.error("Admin support ticket update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
