import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    await db.suggestion.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    return NextResponse.json({ message: "تم رفض الاقتراح" });
  } catch (error) {
    console.error("Reject error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
