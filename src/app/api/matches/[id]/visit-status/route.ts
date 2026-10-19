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

    // Only what the member may see: never the team's notes or internal fields
    const match = await db.mutualMatch.findUnique({
      where: { id },
      select: {
        femaleId: true,
        maleId: true,
        visitRequest: { select: { id: true, status: true, scheduledDate: true, location: true } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    if (match.femaleId !== session.user.id && match.maleId !== session.user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    // A partner who blocked me hides the match from me, like every other by-id match route
    const partnerId = match.femaleId === session.user.id ? match.maleId : match.femaleId;
    const blockedMe = await db.block.findFirst({
      where: { blockerId: partnerId, blockedId: session.user.id },
      select: { id: true },
    });
    if (blockedMe) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ visitRequest: match.visitRequest });
  } catch (error) {
    console.error("Visit status error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
