import { NextRequest, NextResponse } from "next/server";
import { parsePagination } from "@/lib/utils";
import { toCountry } from "@/lib/countries";
import { BLOG_PAGE_SIZE, listPublishedPosts } from "@/lib/blog";
import { PUBLIC_SHORT_CACHE } from "@/lib/public-cache";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const { page } = parsePagination(searchParams, BLOG_PAGE_SIZE);
    return NextResponse.json(await listPublishedPosts({ country: toCountry(searchParams.get("country")), category: searchParams.get("category"), page }), { headers: PUBLIC_SHORT_CACHE });
  } catch (error) {
    console.error("Blog list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
