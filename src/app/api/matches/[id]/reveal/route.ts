import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    return NextResponse.json({ message: "تم الكشف مسبقاً", revealed: true });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
