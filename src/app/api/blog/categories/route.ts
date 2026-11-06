import { NextRequest, NextResponse } from "next/server";
import { toCountry } from "@/lib/countries";
import { listBlogCategories } from "@/lib/blog";

export async function GET(req: NextRequest) {
  try {
    const categories = await listBlogCategories(toCountry(req.nextUrl.searchParams.get("country")));
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Blog categories error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
