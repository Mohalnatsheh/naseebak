import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { enumParam, safePagination } from "@/lib/admin/query";
import type { TicketStatus, TicketType } from "@prisma/client";

const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const TICKET_TYPES: TicketType[] = ["ISSUE", "SUGGESTION", "CHANGE_REQUEST"];

const statusLabels: Record<string, string> = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
};

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = safePagination(searchParams, 20);
    // Unknown filter values are ignored
    const status = enumParam(searchParams.get("status"), TICKET_STATUSES);
    const type = enumParam(searchParams.get("type"), TICKET_TYPES);

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
        skip,
        take: pageSize,
      }),
      db.supportTicket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      total,
      pages: Math.ceil(total / pageSize),
      page,
    });
  } catch (error) {
    console.error("Admin support tickets error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    const { ticketId, status, adminNote } = body;

    if (!ticketId || !status) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    if (!TICKET_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const data: Record<string, unknown> = { status };
    // Only touch the note when the admin sent one ("" clears it); a missing field keeps it
    if (adminNote !== undefined) {
      data.adminNote = typeof adminNote === "string" && adminNote.trim() ? adminNote.trim() : null;
    }

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

    await notify({
      userId: ticket.userId,
      type: "SUPPORT",
      title: "تحديث تذكرة الدعم",
      body: notifBody,
      url: "/dashboard/support",
      metadata: { ticketId: ticket.id },
    });

    return NextResponse.json({ message: "Ticket updated", ticket });
  } catch (error) {
    console.error("Admin support ticket update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
