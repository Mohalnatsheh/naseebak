import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category");
    const { page, pageSize, skip } = parsePagination(searchParams, 9);

    const where: Record<string, unknown> = { status: "PUBLISHED" as const };
    if (category) {
      where.category = { slug: category };
    }

    const [posts, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        include: { category: true },
        orderBy: { publishedAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.blogPost.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      page,
      totalPages: Math.ceil(total / pageSize),
      total,
    });
  } catch (error) {
    console.error("Blog list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
