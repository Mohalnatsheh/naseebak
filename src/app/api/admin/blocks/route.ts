import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);

    const [blocks, total] = await Promise.all([
      db.block.findMany({
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
      db.block.count(),
    ]);

    return NextResponse.json({
      blocks,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin blocks error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
