import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/admin/query";
import { createBlogPostSchema } from "@/lib/validations/blog";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;
    const body = await req.json();
    const parsed = createBlogPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة", details: parsed.error.issues }, { status: 400 });
    }

    const existing = await db.blogPost.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check slug uniqueness if changed
    if (parsed.data.slug !== existing.slug) {
      const slugExists = await db.blogPost.findUnique({ where: { slug: parsed.data.slug } });
      if (slugExists) {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
    }

    const { title, slug, excerpt, content, categoryId, status, readTime } = parsed.data;

    // Set publishedAt when first published
    let publishedAt = existing.publishedAt;
    if (status === "PUBLISHED" && !existing.publishedAt) {
      publishedAt = new Date();
    }

    const post = await db.blogPost.update({
      where: { id },
      data: { title, slug, excerpt, content, categoryId, status, readTime, publishedAt },
      include: { category: true },
    });

    return NextResponse.json({ post });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("Admin blog update error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    const existing = await db.blogPost.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await db.blogPost.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("Admin blog delete error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
