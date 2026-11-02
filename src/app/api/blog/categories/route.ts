import { NextResponse } from "next/server";
import { listBlogCategories } from "@/lib/blog";

export async function GET() {
  try {
    const categories = await listBlogCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Blog categories error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
