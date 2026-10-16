import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";

/**
 * Attach chat metadata to reports: the chat the report was sent from (Report.conversationId), or —
 * for older reports — the chat the two people had, if any. Dates, status and counts only.
 */
async function withChats<T extends { reporterId: string; reportedId: string; conversationId: string | null }>(
  reports: T[]
) {
  if (reports.length === 0) return [];
  const conversations = await db.conversation.findMany({
    where: {
      OR: [
        { id: { in: reports.flatMap((r) => (r.conversationId ? [r.conversationId] : [])) } },
        {
          match: {
            OR: reports.map((r) => ({
              OR: [
                { femaleId: r.reporterId, maleId: r.reportedId },
                { femaleId: r.reportedId, maleId: r.reporterId },
              ],
            })),
          },
        },
      ],
    },
    select: {
      id: true, status: true, createdAt: true, expiresAt: true, endedAt: true, endedById: true,
      match: { select: { femaleId: true, maleId: true } },
      _count: { select: { messages: true } },
    },
  });
  const now = new Date();
  return reports.map((r) => {
    const c =
      conversations.find((x) => x.id === r.conversationId) ??
      conversations.find((x) => {
        const pair = [x.match.femaleId, x.match.maleId];
        return pair.includes(r.reporterId) && pair.includes(r.reportedId);
      });
    return {
      ...r,
      chat: c
        ? {
            id: c.id,
            fromChat: c.id === r.conversationId,
            status: effectiveConversationStatus(c, now),
            createdAt: c.createdAt,
            endedAt: c.endedAt,
            endedByReporter: c.endedById === r.reporterId,
            messages: c._count.messages,
          }
        : null,
    };
  });
}

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 20);
    const status = searchParams.get("status") || undefined;

    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true } },
          reported: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.report.count({ where }),
    ]);

    return NextResponse.json({
      reports: await withChats(reports),
      total,
      pages: Math.ceil(total / pageSize),
      page,
    });
  } catch (error) {
    console.error("Admin reports error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { reportId, status, adminNote } = body;

    if (!reportId || !status) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    if (!["REVIEWED", "DISMISSED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const report = await db.report.update({
      where: { id: reportId },
      data: {
        status,
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Report updated", report });
  } catch (error) {
    console.error("Admin report update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
