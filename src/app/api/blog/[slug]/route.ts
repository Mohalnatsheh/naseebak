import { NextRequest, NextResponse } from "next/server";
import { getPublishedPost } from "@/lib/blog";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const post = await getPublishedPost(slug);

    if (!post) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Blog post error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
