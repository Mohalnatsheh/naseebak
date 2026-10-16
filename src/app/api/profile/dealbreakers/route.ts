import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEALBREAKER_KEYS } from "@/lib/matching/score";

/**
 * "شروطي الأساسية": preferences the user marked as hard filters for suggestions.
 * A private matching filter (never shown to anyone), so it saves directly without admin review.
 */
export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const profile = await db.profile.findUnique({
      where: { userId: result.session.user.id },
      select: {
        dealbreakers: true, prefAgeMin: true, prefAgeMax: true, prefCity: true, prefEducation: true,
        prefMaritalStatus: true, prefReligiosity: true, prefSmokingStatus: true, prefHijab: true,
        prefBeard: true, prefChildrenAcceptance: true,
      },
    });
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Get dealbreakers error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

const schema = z.object({ keys: z.array(z.enum(DEALBREAKER_KEYS)).max(DEALBREAKER_KEYS.length) });

export async function PUT(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const updated = await db.profile.updateMany({
      where: { userId: result.session.user.id },
      data: { dealbreakers: [...new Set(parsed.data.keys)] },
    });
    if (updated.count === 0) return NextResponse.json({ error: "أكمل ملفك الشخصي أولاً" }, { status: 404 });
    return NextResponse.json({ message: "تم حفظ شروطك الأساسية", keys: [...new Set(parsed.data.keys)] });
  } catch (error) {
    console.error("Save dealbreakers error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
