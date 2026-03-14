import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    return NextResponse.json({ message: "تم الكشف مسبقاً", revealed: true });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
