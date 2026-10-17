import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateOfBirthError } from "@/lib/validations/profile";
import { closeSuggestionsBreakingDealbreakers } from "@/lib/suggestions/dealbreaker-sweep";
import { autoSuggestForUser } from "@/lib/matching/auto-suggest";

/**
 * Partner preferences are a private matching filter (like «شروط أساسية»): they save directly, no
 * admin review. Everything else in `changes` still becomes a reviewed request.
 */
const PREF_KEYS = [
  "prefAgeMin", "prefAgeMax", "prefCity", "prefEducation", "prefMaritalStatus",
  "prefHijab", "prefBeard", "prefReligiosity", "prefSmokingStatus", "prefChildrenAcceptance",
] as const;
const LIST_PREFS = new Set(["prefCity", "prefEducation", "prefMaritalStatus", "prefReligiosity", "prefSmokingStatus"]);

/** Clean values for the profile columns; null when the value doesn't fit. */
function prefValue(key: string, v: unknown): unknown {
  if (key === "prefAgeMin" || key === "prefAgeMax") {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v));
    return Number.isFinite(n) && n >= 18 && n <= 80 ? n : undefined;
  }
  if (LIST_PREFS.has(key)) return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 30) : undefined;
  return v === null || typeof v === "string" ? v || null : undefined;
}

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { changes, message } = body;

    if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "يرجى تحديد التعديلات المطلوبة" }, { status: 400 });
    }
    if (typeof changes.dateOfBirth === "string" && changes.dateOfBirth) {
      const dobError = dateOfBirthError(changes.dateOfBirth);
      if (dobError) return NextResponse.json({ error: dobError }, { status: 400 });
    }

    const userId = session.user.id;
    const prefs: Record<string, unknown> = {};
    const reviewed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes as Record<string, unknown>)) {
      if ((PREF_KEYS as readonly string[]).includes(k)) {
        const clean = prefValue(k, v);
        if (clean === undefined) return NextResponse.json({ error: "قيمة غير صالحة في تفضيلات الشريك" }, { status: 400 });
        prefs[k] = clean;
      } else {
        reviewed[k] = v;
      }
    }
    if (typeof prefs.prefAgeMin === "number" && typeof prefs.prefAgeMax === "number" && prefs.prefAgeMin > prefs.prefAgeMax) {
      return NextResponse.json({ error: "العمر الأدنى يجب أن يكون أقل من العمر الأقصى" }, { status: 400 });
    }

    if (Object.keys(prefs).length > 0) {
      await db.profile.update({ where: { userId }, data: prefs });
      // New preferences: close open suggestions that now break a «شرط أساسي», then fill the gaps
      closeSuggestionsBreakingDealbreakers(userId)
        .then(() => autoSuggestForUser(userId))
        .catch((e) => console.error("Preference change top-up error:", e));
    }
    if (Object.keys(reviewed).length === 0) {
      return NextResponse.json({ message: "تم حفظ تفضيلات الشريك", applied: Object.keys(prefs), requested: false });
    }

    // Check if user already has a pending request
    const existing = await db.profileUpdateRequest.findFirst({
      where: { userId: session.user.id, status: "PENDING" },
    });

    if (existing) {
      return NextResponse.json(
        { error: "لديك طلب تعديل قيد المراجعة بالفعل" },
        { status: 409 }
      );
    }

    const updateRequest = await db.profileUpdateRequest.create({
      data: {
        userId: session.user.id,
        changes: reviewed as object,
        message: message || null,
      },
    });

    return NextResponse.json({ message: "تم إرسال طلب التعديل بنجاح", request: updateRequest, applied: Object.keys(prefs), requested: true });
  } catch (error: unknown) {
    // Log the detail, never send it to the browser
    console.error("Profile update request error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const requests = await db.profileUpdateRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Profile update request list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
