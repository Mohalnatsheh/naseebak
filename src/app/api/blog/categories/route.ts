import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const categories = await db.blogCategory.findMany({
      include: {
        _count: {
          select: {
            posts: { where: { status: "PUBLISHED" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Blog categories error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
