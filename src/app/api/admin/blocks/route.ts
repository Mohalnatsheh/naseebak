import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { byUserCountry, getAdminCountry } from "@/lib/admin/country-filter";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);

    // Admin's selected country, by the blocker's country
    const where = byUserCountry(await getAdminCountry(request), "blocker");

    const [blocks, total] = await Promise.all([
      db.block.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          blocker: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          blocked: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      db.block.count({ where }),
    ]);

    // How many people blocked each member on this page, in any country: a pattern worth a look
    const ids = [...new Set(blocks.map((b) => b.blocked.id))];
    const blockedBy = ids.length
      ? await db.block.groupBy({ by: ["blockedId"], where: { blockedId: { in: ids } }, _count: { _all: true } })
      : [];
    const counts = new Map(blockedBy.map((b) => [b.blockedId, b._count._all]));

    return NextResponse.json({
      blocks: blocks.map((b) => ({ ...b, blockedByCount: counts.get(b.blocked.id) ?? 1 })),
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin blocks error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
