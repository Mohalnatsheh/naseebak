import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { safePagination } from "@/lib/admin/query";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { page, pageSize, skip } = safePagination(
      new URL(request.url).searchParams,
      20,
    );
    const where = { cancelledAt: null };

    const [requests, total] = await Promise.all([
      db.accountDeletionRequest.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          reason: true,
          scheduledAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              isDeactivated: true,
            },
          },
        },
      }),
      db.accountDeletionRequest.count({ where }),
    ]);

    return NextResponse.json({
      requests,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin deletions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
