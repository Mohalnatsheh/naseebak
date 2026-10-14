import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const post = await db.blogPost.findUnique({
      where: { slug, status: "PUBLISHED" },
      include: { category: true },
    });

    if (!post) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Blog post error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
