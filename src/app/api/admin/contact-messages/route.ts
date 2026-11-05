import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumParam, safePagination } from "@/lib/admin/query";
import { getAdminCountry, userCountryWhere } from "@/lib/countries/server";

const FILTERS = ["open", "handled", "all"] as const;

/**
 * Contact-page messages; `?filter=open|handled|all` (default open), open ones oldest first, the
 * others newest first. `?id=` gives one message (the Inbox's «Open» link), whatever the filter.
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = safePagination(searchParams, 20);
    const filter = enumParam(searchParams.get("filter"), FILTERS) ?? "open";
    // Admin's selected country (ContactMessage.country = the visitor's country when sent)
    const byCountry = userCountryWhere(await getAdminCountry(request));
    const id = searchParams.get("id");
    const where = {
      ...byCountry,
      ...(id ? { id } : filter === "open" ? { handledAt: null } : filter === "handled" ? { handledAt: { not: null } } : {}),
    };

    const [messages, total, open] = await Promise.all([
      db.contactMessage.findMany({ where, orderBy: { createdAt: filter === "open" ? "asc" : "desc" }, skip, take: pageSize }),
      db.contactMessage.count({ where }),
      db.contactMessage.count({ where: { ...byCountry, handledAt: null } }),
    ]);

    // Sent while signed in: link to the member (no relation in the schema, and the account may be gone)
    const senderIds = [...new Set(messages.flatMap((m) => (m.userId ? [m.userId] : [])))];
    const senders = senderIds.length
      ? await db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, firstName: true, lastName: true, status: true } })
      : [];
    const senderById = new Map(senders.map((u) => [u.id, u]));

    return NextResponse.json({
      messages: messages.map((m) => ({ ...m, user: (m.userId && senderById.get(m.userId)) || null })),
      total,
      open,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin contact messages error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
