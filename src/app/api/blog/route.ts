import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = 9;

    const where: Record<string, unknown> = { status: "PUBLISHED" as const };
    if (category) {
      where.category = { slug: category };
    }

    const [posts, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        include: { category: true },
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * pageSize,
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
