import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";
import { effectiveConversationStatus, effectiveRequestStatus } from "@/lib/admin/cycle-stats";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;

/**
 * Mutual matches with where each one stands: latest family / chat request, the chat and any legacy
 * visit request. Metadata only.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, skip, pageSize: take } = parsePagination(searchParams, 20);
    const who = personSearch(searchParams.get("q"));
    const where: Prisma.MutualMatchWhereInput = who ? { OR: [{ female: who }, { male: who }] } : {};
    const now = new Date();

    const [total, rows] = await Promise.all([
      db.mutualMatch.count({ where }),
      db.mutualMatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          createdAt: true,
          openedAt: true,
          femaleGuardianShareAt: true,
          maleGuardianShareAt: true,
          femaleOutcome: true,
          maleOutcome: true,
          followUpCount: true,
          female: person,
          male: person,
          visitRequest: { select: { status: true } },
          conversation: { select: { id: true, status: true, expiresAt: true } },
          introRequests: {
            orderBy: { createdAt: "desc" },
            select: { type: true, status: true, expiresAt: true, senderId: true, respondedAt: true },
          },
        },
      }),
    ]);

    const latest = (rs: (typeof rows)[number]["introRequests"], type: "FAMILY" | "CHAT") => {
      const r = rs.find((x) => x.type === type);
      // Rows created automatically when both chose the same path on «مهتم» (answered at creation)
      const auto = !!r?.respondedAt && r.respondedAt.getTime() === r.expiresAt.getTime();
      return r ? { status: effectiveRequestStatus(r, now), senderId: r.senderId, auto } : null;
    };

    return NextResponse.json({
      matches: rows.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        people: [m.female, m.male],
        family: latest(m.introRequests, "FAMILY"),
        chatRequest: latest(m.introRequests, "CHAT"),
        chat: m.conversation ? { id: m.conversation.id, status: effectiveConversationStatus(m.conversation, now) } : null,
        visit: m.visitRequest?.status ?? null,
        // Opened straight from «مهتم»: whose guardian contact is shared on this match
        guardianShared: m.openedAt ? { female: !!m.femaleGuardianShareAt, male: !!m.maleGuardianShareAt } : null,
        outcome: { female: m.femaleOutcome, male: m.maleOutcome, followUps: m.followUpCount },
      })),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (error) {
    console.error("Admin matches error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
