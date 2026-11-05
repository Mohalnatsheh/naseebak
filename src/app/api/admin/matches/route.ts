import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";
import { getAdminCountry, matchCountryWhere } from "@/lib/admin/country-filter";
import { effectiveConversationStatus, effectiveRequestStatus } from "@/lib/admin/cycle-stats";
import { enumParam } from "@/lib/admin/query";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;

/** Stalled pairs: `no_request` nothing asked yet · `waiting` a request nobody answered · `not_started` a chat with no message */
const STALLED = ["no_request", "waiting", "not_started"] as const;

/**
 * Mutual matches with where each one stands: latest family / chat request, the chat and any legacy
 * visit request. Metadata only. `q` name/phone or a pasted match id · `stalled` see STALLED.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, skip, pageSize: take } = parsePagination(searchParams, 20);
    const q = searchParams.get("q")?.trim() ?? "";
    const stalled = enumParam(searchParams.get("stalled"), STALLED);
    // A pasted match id finds that match directly (the chat page links here this way)
    const byId = /^c[a-z0-9]{20,30}$/.test(q) ? q : null;
    const who = byId ? null : personSearch(q);
    const now = new Date();
    // Admin's selected country (both people of a match are always from one country)
    const where: Prisma.MutualMatchWhereInput = {
      ...matchCountryWhere(await getAdminCountry(request)),
      ...(byId && { id: byId }),
      ...(who && { OR: [{ female: who }, { male: who }] }),
      ...(stalled === "no_request" && { introRequests: { none: {} }, conversation: null }),
      ...(stalled === "waiting" && { introRequests: { some: { status: "PENDING", expiresAt: { gt: now } } } }),
      ...(stalled === "not_started" && { conversation: { messages: { none: {} } } }),
    };

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
