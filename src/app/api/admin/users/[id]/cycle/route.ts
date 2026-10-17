import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { effectiveConversationStatus, effectiveRequestStatus } from "@/lib/admin/cycle-stats";

const person = { id: true, firstName: true, lastName: true } as const;

/**
 * One user's new-cycle activity for the admin user page: introduction requests, chats and credit
 * history. Chats carry dates, status and message counts; content is in /api/admin/chats/[id]/messages.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { id } = await params;
    const now = new Date();

    const [requests, matches, ledger] = await Promise.all([
      db.introRequest.findMany({
        where: { OR: [{ senderId: id }, { receiverId: id }] },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, type: true, status: true, senderId: true, matchId: true,
          createdAt: true, respondedAt: true, expiresAt: true,
          sender: { select: person },
          receiver: { select: person },
        },
      }),
      db.mutualMatch.findMany({
        where: { OR: [{ femaleId: id }, { maleId: id }], conversation: { isNot: null } },
        select: {
          female: { select: person },
          male: { select: person },
          conversation: {
            select: {
              id: true, status: true, createdAt: true, expiresAt: true,
              extended: true, endedById: true, endedByAdminId: true, endedAt: true,
            },
          },
        },
      }),
      db.creditLedger.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, delta: true, reason: true, refId: true, adminId: true, note: true, createdAt: true },
      }),
    ]);

    const conversationIds = matches.flatMap((m) => (m.conversation ? [m.conversation.id] : []));
    const counts = conversationIds.length
      ? await db.message.groupBy({
          by: ["conversationId", "senderId"],
          where: { conversationId: { in: conversationIds } },
          _count: { _all: true },
        })
      : [];

    const chats = matches
      .flatMap((m) => {
        const c = m.conversation;
        if (!c) return [];
        const other = m.female.id === id ? m.male : m.female;
        const mine = counts.filter((r) => r.conversationId === c.id);
        const byUser = mine.filter((r) => r.senderId === id).reduce((n, r) => n + r._count._all, 0);
        const total = mine.reduce((n, r) => n + r._count._all, 0);
        return [{
          id: c.id,
          other,
          status: effectiveConversationStatus(c, now),
          createdAt: c.createdAt,
          expiresAt: c.expiresAt,
          extended: c.extended,
          endedBy: c.endedByAdminId
            ? "admin"
            : c.endedById == null ? null : c.endedById === id ? "user" : "other",
          endedByAdmin: !!c.endedByAdminId,
          endedAt: c.endedAt,
          messages: { total, byUser, byOther: total - byUser },
        }];
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const adminIds = [...new Set(ledger.flatMap((l) => (l.adminId ? [l.adminId] : [])))];
    const admins = adminIds.length
      ? await db.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
      : [];
    const adminEmail = new Map(admins.map((a) => [a.id, a.email]));

    return NextResponse.json({
      introRequests: requests.map((r) => ({
        id: r.id,
        type: r.type,
        matchId: r.matchId,
        direction: r.senderId === id ? "sent" : "received",
        other: r.senderId === id ? r.receiver : r.sender,
        status: effectiveRequestStatus(r, now),
        createdAt: r.createdAt,
        respondedAt: r.respondedAt,
        expiresAt: r.expiresAt,
      })),
      chats,
      ledger: ledger.map((l) => ({ ...l, admin: l.adminId ? adminEmail.get(l.adminId) ?? null : null })),
    });
  } catch (error) {
    console.error("Admin user cycle error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
