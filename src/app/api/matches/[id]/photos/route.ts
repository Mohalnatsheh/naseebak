import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockBetween, isUnavailable } from "@/lib/matches/state";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    const photoSelect = { select: { id: true, url: true, order: true }, orderBy: { order: "asc" as const } };
    const match = await db.mutualMatch.findUnique({
      where: { id },
      include: {
        female: { select: { id: true, isDeactivated: true, status: true, photos: photoSelect } },
        male: { select: { id: true, isDeactivated: true, status: true, photos: photoSelect } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    if (match.femaleId !== session.user.id && match.maleId !== session.user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const other = match.femaleId === session.user.id ? match.male : match.female;

    // A block (either way) closes the match: the blocked side doesn't even see it any more
    const block = await blockBetween(session.user.id, other.id);
    if (block.byThem) return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    if (block.byMe) return NextResponse.json({ error: "انتهى هذا التوافق" }, { status: 403 });
    if (isUnavailable(other)) {
      return NextResponse.json({ error: "هذا الحساب غير نشط حالياً" }, { status: 403 });
    }

    return NextResponse.json({ photos: other.photos });
  } catch (error) {
    console.error("Match photos error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
