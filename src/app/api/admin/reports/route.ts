import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";
import { adminEndConversation, setSuspended } from "@/lib/admin/moderation";
import { endPausedChat, refreshReportFlag } from "@/lib/reports";

/**
 * Attach chat metadata to reports: the chat the report was sent from (Report.conversationId), or —
 * for older reports — the chat the two people had, if any. Dates, status and counts only.
 */
async function withChats<T extends { reporterId: string | null; reportedId: string | null; conversationId: string | null }>(
  reports: T[]
) {
  if (reports.length === 0) return [];
  // A deleted account leaves its side null: only its saved evidence is left (Report.evidence)
  const paired = reports.filter((r): r is T & { reporterId: string; reportedId: string } => !!r.reporterId && !!r.reportedId);
  const conversations = await db.conversation.findMany({
    where: {
      OR: [
        { id: { in: reports.flatMap((r) => (r.conversationId ? [r.conversationId] : [])) } },
        {
          match: {
            OR: paired.map((r) => ({
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
      id: true, status: true, createdAt: true, expiresAt: true, endedAt: true, endedById: true, endedByAdminId: true,
      match: { select: { femaleId: true, maleId: true } },
      _count: { select: { messages: true } },
    },
  });
  const now = new Date();
  return reports.map((r) => {
    const c =
      conversations.find((x) => x.id === r.conversationId) ??
      (r.reporterId && r.reportedId
        ? conversations.find((x) => {
            const pair = [x.match.femaleId, x.match.maleId];
            return pair.includes(r.reporterId!) && pair.includes(r.reportedId!);
          })
        : undefined);
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
            endedByAdmin: !!c.endedByAdminId,
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

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 20);
    const raw = searchParams.get("status");
    const status = raw === "PENDING" || raw === "REVIEWED" || raw === "DISMISSED" ? raw : undefined;

    const where: Prisma.ReportWhereInput = status ? { status } : {};

    const [reports, total] = await Promise.all([
      db.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, firstName: true, lastName: true } },
          reported: { select: { id: true, firstName: true, lastName: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.report.count({ where }),
    ]);

    const reviewerIds = [...new Set(reports.flatMap((r) => (r.reviewedById ? [r.reviewedById] : [])))];
    const reviewers = reviewerIds.length
      ? await db.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, email: true } })
      : [];
    const reviewerEmail = new Map(reviewers.map((r) => [r.id, r.email]));

    return NextResponse.json({
      reports: (await withChats(reports)).map((r) => ({
        ...r,
        reviewedBy: r.reviewedById ? reviewerEmail.get(r.reviewedById) ?? null : null,
      })),
      total,
      pages: Math.ceil(total / pageSize),
      page,
    });
  } catch (error) {
    console.error("Admin reports error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Review a report. Optional actions in the same click: suspend the reported user and/or end the
 * chat the report came from. The reviewing admin is recorded.
 */
export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const adminId = result.session.user.id;

    const body = await request.json().catch(() => ({}));
    const { reportId, status, adminNote, suspendReported, endChat } = body as {
      reportId?: string;
      status?: string;
      adminNote?: string;
      suspendReported?: boolean;
      endChat?: boolean;
    };

    if (!reportId || !status) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }
    if (status !== "REVIEWED" && status !== "DISMISSED") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await db.report.findUnique({
      where: { id: reportId },
      select: { id: true, reporterId: true, reportedId: true, conversationId: true },
    });
    if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const actions: string[] = [];
    if (endChat) {
      const [chat] = await withChats([existing]);
      // A chat paused for the review is ended for good (it won't resume when the reports are cleared)
      if (chat.chat && ((await endPausedChat(chat.chat.id, adminId)) || (await adminEndConversation(chat.chat.id, adminId)))) {
        actions.push("chat ended");
      }
    }
    if (suspendReported && existing.reportedId) {
      const res = await setSuspended(existing.reportedId, true, adminId);
      if (res.changed) actions.push("user suspended");
    }

    const report = await db.report.update({
      where: { id: reportId },
      data: {
        status,
        adminNote: adminNote || null,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    // Dismissals can clear an automatic flag; once fewer than 3 reports wait, paused chats resume
    if (existing.reportedId) {
      const after = await refreshReportFlag(existing.reportedId);
      if (after.resumed > 0) actions.push(`${after.resumed} paused chat(s) resumed`);
    }

    return NextResponse.json({ message: "Report updated", report, actions });
  } catch (error) {
    console.error("Admin report update error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
