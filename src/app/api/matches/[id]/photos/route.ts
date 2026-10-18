import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCycleFlags } from "@/lib/settings";
import { loadMatchStates } from "@/lib/matches/state";

/** Closures that lock the partner's photos (like the full profile on GET /api/matches) */
const LOCKED: Record<string, string> = {
  blocked: "انتهى هذا التوافق",
  ended: "انتهى هذا التوافق",
  inactive: "هذا الحساب غير نشط حالياً",
};

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

    // Same rules as the match card: a partner who blocked me hides the match (404); my block, an
    // inactive (or engaged elsewhere) partner and «لم يحصل نصيب» lock the photos (403).
    // Note: photo URLs are public CDN paths, so a URL seen before stays reachable (signed URLs: TODO).
    const state = (await loadMatchStates(session.user.id, await getCycleFlags(), [id])).get(id);
    if (!state) return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    const lockedMessage = state.closed ? LOCKED[state.closed] : undefined;
    if (lockedMessage) return NextResponse.json({ error: lockedMessage }, { status: 403 });

    return NextResponse.json({ photos: other.photos });
  } catch (error) {
    console.error("Match photos error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
