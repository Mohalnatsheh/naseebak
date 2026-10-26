import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";
import { getAdminCountry, matchCountryWhere } from "@/lib/admin/country-filter";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";
import { chatSmsOverview } from "@/lib/chat/unread-sms";

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
    // Admin's selected country (both people of a match are always from one country)
    const byCountry = matchCountryWhere(await getAdminCountry(request));
    const matchWhere: Prisma.MutualMatchWhereInput = { ...byCountry, ...(who && { OR: [{ female: who }, { male: who }] }) };

    const where: Prisma.ConversationWhereInput = {
      ...(status === "ACTIVE" && { status: "ACTIVE", expiresAt: { gt: now } }),
      ...(status === "ENDED" && { status: "ENDED" }),
      ...(status === "EXPIRED" && { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] }),
      ...(Object.keys(matchWhere).length > 0 && { match: matchWhere }),
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
          messages: { where: { readAt: null }, select: { id: true } },
        },
      }),
    ]);

    const smsInfo = await chatSmsOverview(rows.map((r) => r.id));

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
        unread: c.messages.length,
        // Chats that haven't started: who hasn't written and their one SMS (lib/chat/unread-sms.ts)
        sms: smsInfo.get(c.id) ?? null,
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
