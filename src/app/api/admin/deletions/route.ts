import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const requests = await db.accountDeletionRequest.findMany({
      where: { cancelledAt: null },
      orderBy: { scheduledAt: "asc" },
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
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Admin deletions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
