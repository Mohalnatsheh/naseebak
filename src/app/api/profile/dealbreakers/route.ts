import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEALBREAKER_KEYS } from "@/lib/matching/score";
import { closeSuggestionsBreakingDealbreakers } from "@/lib/suggestions/dealbreaker-sweep";
import { autoSuggestForUser, clearSuggestCooldown } from "@/lib/matching/auto-suggest";
import { stripSectUnlessLebanon } from "@/lib/profile-sect";
import { stripMuslimOnlyForChristian } from "@/lib/profile-religion";

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
        prefMaritalStatus: true, prefReligiosity: true, prefSmokingStatus: true, prefSect: true, prefHijab: true,
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
    // The «المذهب» condition exists for Lebanese members only; hijab, beard and sect never for a Christian
    // (whatever the «الديانة» switch says: a stored Christian stays one)
    const member = await db.user.findUnique({
      where: { id: result.session.user.id },
      select: { country: true, profile: { select: { religion: true } } },
    });
    const { dealbreakers: keys } = stripMuslimOnlyForChristian(
      member?.profile?.religion,
      stripSectUnlessLebanon(member?.country, { dealbreakers: [...new Set(parsed.data.keys)] }),
    );
    const updated = await db.profile.updateMany({
      where: { userId: result.session.user.id },
      data: { dealbreakers: keys },
    });
    if (updated.count === 0) return NextResponse.json({ error: "أكمل ملفك الشخصي أولاً" }, { status: 404 });
    // Open suggestions that now break a condition are closed, then the list is filled with ones that pass:
    // also after a condition was removed, which closes nothing but can bring new people
    const userId = result.session.user.id;
    clearSuggestCooldown(userId);
    await closeSuggestionsBreakingDealbreakers(userId)
      .then(() => autoSuggestForUser(userId))
      .catch((e) => console.error("Dealbreaker sweep error:", e));
    return NextResponse.json({ message: "تم حفظ شروطك الأساسية", keys });
  } catch (error) {
    console.error("Save dealbreakers error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
