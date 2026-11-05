import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { personSearch } from "@/lib/admin/search";
import { getAdminCountry, matchCountryWhere } from "@/lib/admin/country-filter";
import { effectiveConversationStatus } from "@/lib/admin/cycle-stats";
import { chatSmsOverview } from "@/lib/chat/unread-sms";
import { enumParam } from "@/lib/admin/query";
import {
  CHAT_SORTS, CHAT_VIEWS, buildChatActivity, chatEndedBy, chatSummary, matchesView, sortChats,
  type ChatActivity, type LastMessageRow,
} from "@/lib/admin/chat-list";

const person = { select: { id: true, firstName: true, lastName: true, status: true } } as const;

/**
 * All chats: who, dates, status, who ended it, activity (last message, who wrote it, messages per person).
 * `q` name/phone/chat id · `status` ACTIVE|ENDED|EXPIRED · `view` activity filter · `sort` (default last message).
 * Activity is grouped from the messages of the chats in scope (the selected country: the summary covers
 * all of them), then filtered, sorted and paged here. Content is in [id]/messages.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, skip, pageSize: take } = parsePagination(searchParams, 20);
    const now = new Date();
    const status = searchParams.get("status");
    const view = enumParam(searchParams.get("view"), CHAT_VIEWS);
    const sort = enumParam(searchParams.get("sort"), CHAT_SORTS) ?? "last_message";
    const q = searchParams.get("q")?.trim() ?? "";
    const who = personSearch(q);
    // A pasted chat id finds that chat directly
    const byId = /^c[a-z0-9]{20,30}$/.test(q) ? q : null;
    // Admin's selected country (both people of a match are always from one country)
    const country = await getAdminCountry(request);
    const byCountry = matchCountryWhere(country);

    const where: Prisma.ConversationWhereInput = {
      ...(status === "ACTIVE" && { status: "ACTIVE", expiresAt: { gt: now } }),
      ...(status === "ENDED" && { status: "ENDED" }),
      ...(status === "EXPIRED" && { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] }),
      ...(byId
        ? { id: byId }
        : { match: { ...byCountry, ...(who && { OR: [{ female: who }, { male: who }] }) } }),
    };

    // Every chat of the country (small table) with its activity, for the summary, the filters and the sort
    const all = await db.conversation.findMany({
      where: { match: byCountry },
      select: { id: true, status: true, createdAt: true, expiresAt: true, endedByAdminId: true },
    });
    const ids = all.map((c) => c.id);
    // Only these chats' messages. No id list for "ALL": that is every message anyway
    const [perSender, lastRows, reportRows] = await Promise.all([
      ids.length ? db.message.groupBy({ by: ["conversationId", "senderId"], ...(country !== "ALL" && { where: { conversationId: { in: ids } } }), _count: { _all: true } }) : [],
      ids.length
        ? db.$queryRaw<LastMessageRow[]>`
            SELECT DISTINCT ON ("conversationId") "conversationId", "senderId", "createdAt"
            FROM messages WHERE "conversationId" = ANY(${ids}::text[])
            ORDER BY "conversationId", "createdAt" DESC`
        : [],
      db.report.findMany({ where: { conversationId: { not: null } }, select: { conversationId: true } }),
    ]);

    const activity = buildChatActivity(
      all,
      perSender,
      lastRows,
      reportRows.map((r) => r.conversationId),
      (c) => effectiveConversationStatus(c, now),
    );

    // Status + search narrow the ids, then the activity view, then the sort
    const matching = await db.conversation.findMany({ where, select: { id: true } });
    let rows = matching.map((m) => activity.get(m.id)).filter((c): c is ChatActivity => !!c);
    if (view) rows = rows.filter((c) => matchesView(c, view, now));
    rows = sortChats(rows, sort);
    const total = rows.length;
    const pageIds = rows.slice(skip, skip + take).map((c) => c.id);

    const details = await db.conversation.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true, status: true, createdAt: true, expiresAt: true, extended: true,
        endedById: true, endedByAdminId: true, endedAt: true,
        match: { select: { id: true, female: person, male: person } },
        messages: { where: { readAt: null }, select: { id: true } },
      },
    });
    const byIdMap = new Map(details.map((d) => [d.id, d]));
    const smsInfo = await chatSmsOverview(pageIds);

    return NextResponse.json({
      chats: pageIds.flatMap((id) => {
        const c = byIdMap.get(id);
        const a = activity.get(id);
        if (!c || !a) return [];
        const people = [c.match.female, c.match.male];
        return [{
          id: c.id,
          matchId: c.match.id,
          people: people.map((p) => ({ ...p, messages: a.bySender[p.id] ?? 0 })),
          status: a.status,
          createdAt: c.createdAt,
          expiresAt: c.expiresAt,
          extended: c.extended,
          endedAt: c.endedAt,
          endedBy: chatEndedBy(c, people),
          messages: a.messages,
          unread: c.messages.length,
          lastAt: a.lastAt,
          lastBy: a.lastSenderId ? people.find((p) => p.id === a.lastSenderId)?.firstName ?? null : null,
          reported: a.reported,
          // Chats that haven't started: who hasn't written and their one SMS (lib/chat/unread-sms.ts)
          sms: smsInfo.get(c.id) ?? null,
        }];
      }),
      summary: chatSummary([...activity.values()], now),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    });
  } catch (error) {
    console.error("Admin chats error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
