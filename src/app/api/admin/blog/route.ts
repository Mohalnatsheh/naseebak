import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/admin/query";
import { createBlogPostSchema } from "@/lib/validations/blog";
import { parsePagination } from "@/lib/utils";
import { getAdminCountry } from "@/lib/admin/country-filter";

export async function GET(req: NextRequest) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const { searchParams } = req.nextUrl;
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    const country = await getAdminCountry(req);
    const where = country === "ALL" ? {} : { country };

    const [posts, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: "desc" },
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
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("Admin blog list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await req.json();
    const parsed = createBlogPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة", details: parsed.error.issues }, { status: 400 });
    }

    const { title, slug, excerpt, content, categoryId, status, readTime, country } = parsed.data;

    // Check slug uniqueness
    const existing = await db.blogPost.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const post = await db.blogPost.create({
      data: {
        title,
        slug,
        excerpt,
        content,
        categoryId,
        status,
        readTime,
        country: country ?? "JO",
        authorId: session.user.id,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
      include: { category: true },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("Admin blog create error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
