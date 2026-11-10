import { NextRequest, NextResponse } from "next/server";
import { toCountry } from "@/lib/countries";
import { listBlogCategories } from "@/lib/blog";
import { PUBLIC_SHORT_CACHE } from "@/lib/public-cache";

export async function GET(req: NextRequest) {
  try {
    const categories = await listBlogCategories(toCountry(req.nextUrl.searchParams.get("country")));
    return NextResponse.json({ categories }, { headers: PUBLIC_SHORT_CACHE });
  } catch (error) {
    console.error("Blog categories error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
