import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
