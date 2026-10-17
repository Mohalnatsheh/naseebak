import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { maybeAwardReferral } from "@/lib/referral";
import { parentInfoSchema } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/validations/auth";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const parentInfo = await db.parentInfo.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ parentInfo });
  } catch (error) {
    console.error("Parent info get error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    // shareConsent: true = agree to share with the other family after an accepted family
    // introduction, false = withdraw, missing = keep as is
    const shareConsent = (body as { shareConsent?: unknown }).shareConsent;
    const existing = await db.parentInfo.findUnique({
      where: { userId: session.user.id },
      select: { parentName: true, parentPhone: true, relationship: true, address: true, notes: true, shareConsentAt: true },
    });
    const shareConsentAt =
      shareConsent === true ? existing?.shareConsentAt ?? new Date()
      : shareConsent === false ? null
      : existing?.shareConsentAt ?? null;

    // Same contact as stored, only the consent changes: keep it as is (an older entry that predates
    // the stricter rules must not block a consent change)
    const b = body as Record<string, unknown>;
    if (
      existing &&
      b.parentName === existing.parentName &&
      b.parentPhone === existing.parentPhone &&
      b.relationship === existing.relationship &&
      (b.address ?? null) === existing.address
    ) {
      const parentInfo = await db.parentInfo.update({ where: { userId: session.user.id }, data: { shareConsentAt } });
      return NextResponse.json({ message: "تم حفظ بيانات ولي الأمر", parentInfo });
    }

    // A new or changed contact is handed to the other family: validate it like any other user input
    const parsed = parentInfoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
    }
    const { parentName, relationship, address, notes } = parsed.data;
    const parentPhone = normalizePhone(parsed.data.parentPhone);

    const me = await db.user.findUnique({ where: { id: session.user.id }, select: { phone: true } });
    if (me?.phone && me.phone === parentPhone) {
      return NextResponse.json({ error: "رقم وليّ الأمر يجب أن يختلف عن رقم هاتفك" }, { status: 400 });
    }

    const parentInfo = await db.parentInfo.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, parentName, parentPhone, relationship, address, notes, shareConsentAt },
      update: { parentName, parentPhone, relationship, address, notes, shareConsentAt },
    });

    await maybeAwardReferral(session.user.id);
    return NextResponse.json({ message: "تم حفظ بيانات ولي الأمر", parentInfo });
  } catch (error) {
    console.error("Parent info error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
