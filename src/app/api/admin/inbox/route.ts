import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { byUserCountry, getAdminCountry, reportCountryWhere } from "@/lib/admin/country-filter";
import { enumLabel } from "@/lib/admin/enum-labels";
import { adminTodo } from "@/lib/admin/todo";

/** Oldest items per type: enough for a queue, and the counts stay exact whatever the list holds */
const PER_TYPE = 100;

const person = { id: true, firstName: true, lastName: true, status: true } as const;

/**
 * Admin → Inbox (read-only): everything waiting for an admin in one list, oldest first. Uses the
 * same conditions as `adminTodo` (src/lib/admin/todo.ts), which also gives the counts.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const country = await getAdminCountry(request);
    const oldest = { orderBy: { createdAt: "asc" as const }, take: PER_TYPE };

    const [counts, reports, tickets, profileRequests, messages] = await Promise.all([
      adminTodo(country),
      db.report.findMany({
        ...oldest,
        where: { ...reportCountryWhere(country), status: "PENDING" },
        select: {
          id: true, reason: true, createdAt: true,
          reporter: { select: person },
          reported: { select: person },
        },
      }),
      db.supportTicket.findMany({
        ...oldest,
        where: { status: { in: ["OPEN", "IN_PROGRESS"] }, ...byUserCountry(country, "user") },
        select: { id: true, type: true, subject: true, status: true, createdAt: true, user: { select: person } },
      }),
      db.profileUpdateRequest.findMany({
        ...oldest,
        where: { status: "PENDING", ...byUserCountry(country, "user") },
        select: { id: true, changes: true, createdAt: true, user: { select: person } },
      }),
      db.contactMessage.findMany({
        ...oldest,
        where: { handledAt: null, ...(country === "ALL" ? {} : { country }) },
        select: { id: true, name: true, subject: true, userId: true, createdAt: true },
      }),
    ]);

    const senderIds = [...new Set(messages.flatMap((m) => (m.userId ? [m.userId] : [])))];
    const senders = senderIds.length ? await db.user.findMany({ where: { id: { in: senderIds } }, select: person }) : [];
    const senderById = new Map(senders.map((u) => [u.id, u]));

    const items = [
      ...reports.map((r) => ({
        type: "report" as const,
        id: r.id,
        since: r.createdAt,
        // The person the report is about; a deleted account leaves its side empty
        member: r.reported ?? r.reporter,
        summary: enumLabel("reportReason", r.reason) + (r.reporter ? ` · from ${r.reporter.firstName} ${r.reporter.lastName}` : ""),
        href: `/admin/reports?id=${r.id}`,
      })),
      ...tickets.map((t) => ({
        type: "support" as const,
        id: t.id,
        since: t.createdAt,
        member: t.user,
        summary: `${enumLabel("ticketType", t.type)}: ${t.subject}${t.status === "IN_PROGRESS" ? " (in progress)" : ""}`,
        href: `/admin/support?id=${t.id}`,
      })),
      ...profileRequests.map((r) => {
        const fields = Object.keys((r.changes ?? {}) as Record<string, unknown>).length;
        return {
          type: "profile" as const,
          id: r.id,
          since: r.createdAt,
          member: r.user,
          summary: `Profile edit: ${fields} field${fields === 1 ? "" : "s"}`,
          href: `/admin/profile-requests?id=${r.id}`,
        };
      }),
      ...messages.map((m) => ({
        type: "contact" as const,
        id: m.id,
        since: m.createdAt,
        member: (m.userId && senderById.get(m.userId)) || null,
        summary: `${m.name}: ${m.subject}`,
        href: `/admin/messages?id=${m.id}`,
      })),
    ].sort((a, b) => a.since.getTime() - b.since.getTime());

    return NextResponse.json({
      items,
      counts: {
        report: counts.reports,
        support: counts.support,
        profile: counts.profileRequests,
        contact: counts.contactMessages,
      },
      perType: PER_TYPE,
    });
  } catch (error) {
    console.error("Admin inbox error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
