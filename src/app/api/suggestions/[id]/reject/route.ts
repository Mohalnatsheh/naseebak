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

    // Only the recipient can answer, and only once
    const updated = await db.suggestion.updateMany({
      where: { id, recipientId: session.user.id, status: "PENDING", flow: "LEGACY" },
      data: { status: "REJECTED" },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ message: "تم رفض الاقتراح" });
  } catch (error) {
    console.error("Reject error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
