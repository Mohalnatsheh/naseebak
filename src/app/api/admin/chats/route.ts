import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;

/** All chats: who, dates, status, who ended it, message count. Content is in [id]/messages. */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, skip, pageSize: take } = parsePagination(searchParams, 20);
    const now = new Date();
    const status = searchParams.get("status");
    const who = personSearch(searchParams.get("q"));

    const where: Prisma.ConversationWhereInput = {
      ...(status === "ACTIVE" && { status: "ACTIVE", expiresAt: { gt: now } }),
      ...(status === "ENDED" && { status: "ENDED" }),
      ...(status === "EXPIRED" && { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] }),
      ...(who && { match: { OR: [{ female: who }, { male: who }] } }),
    };

    const [total, rows] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true, status: true, createdAt: true, expiresAt: true, extended: true,
          endedById: true, endedByAdminId: true, endedAt: true,
          match: { select: { id: true, female: person, male: person } },
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return NextResponse.json({
      chats: rows.map((c) => ({
        id: c.id,
        matchId: c.match.id,
        people: [c.match.female, c.match.male],
        status: effectiveConversationStatus(c, now),
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        extended: c.extended,
        endedAt: c.endedAt,
        endedBy: c.endedByAdminId
          ? "admin"
          : c.endedById
            ? [c.match.female, c.match.male].find((p) => p.id === c.endedById)?.firstName ?? "user"
            : null,
        messages: c._count.messages,
      })),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (error) {
    console.error("Admin chats error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
