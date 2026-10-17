import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumParam, safePagination } from "@/lib/admin/query";

const FILTERS = ["open", "handled", "all"] as const;

/** Contact-page messages, newest first; `?filter=open|handled|all` (default open) */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = safePagination(searchParams, 20);
    const filter = enumParam(searchParams.get("filter"), FILTERS) ?? "open";
    const where = filter === "open" ? { handledAt: null } : filter === "handled" ? { handledAt: { not: null } } : {};

    const [messages, total, open] = await Promise.all([
      db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      db.contactMessage.count({ where }),
      db.contactMessage.count({ where: { handledAt: null } }),
    ]);

    return NextResponse.json({ messages, total, open, page, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error("Admin contact messages error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
