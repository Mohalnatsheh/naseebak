import { NextRequest, NextResponse } from "next/server";
import { parsePagination } from "@/lib/utils";
import { BLOG_PAGE_SIZE, listPublishedPosts } from "@/lib/blog";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const { page } = parsePagination(searchParams, BLOG_PAGE_SIZE);
    return NextResponse.json(await listPublishedPosts({ category: searchParams.get("category"), page }));
  } catch (error) {
    console.error("Blog list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
