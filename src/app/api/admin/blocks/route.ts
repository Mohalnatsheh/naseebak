import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const skip = (page - 1) * limit;

    const [blocks, total] = await Promise.all([
      db.block.findMany({
        skip,
        take: limit,
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
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Admin blocks error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
