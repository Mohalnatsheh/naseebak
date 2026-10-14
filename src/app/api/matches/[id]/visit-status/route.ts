import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    const match = await db.mutualMatch.findUnique({
      where: { id },
      include: { visitRequest: true },
    });

    if (!match) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    if (match.femaleId !== session.user.id && match.maleId !== session.user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    return NextResponse.json({ visitRequest: match.visitRequest });
  } catch (error) {
    console.error("Visit status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
