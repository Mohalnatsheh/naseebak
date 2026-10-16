import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const body = await request.json();
    const { parentName, parentPhone, relationship, address, notes, shareConsent } = body;

    if (!parentName || !parentPhone || !relationship) {
      return NextResponse.json({ error: "جميع الحقول المطلوبة يجب ملؤها" }, { status: 400 });
    }

    // shareConsent: true = agree to share with the other family after an accepted family
    // introduction, false = withdraw, missing = keep as is
    const existing = await db.parentInfo.findUnique({
      where: { userId: session.user.id },
      select: { shareConsentAt: true },
    });
    const shareConsentAt =
      shareConsent === true ? existing?.shareConsentAt ?? new Date()
      : shareConsent === false ? null
      : existing?.shareConsentAt ?? null;

    const parentInfo = await db.parentInfo.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, parentName, parentPhone, relationship, address, notes, shareConsentAt },
      update: { parentName, parentPhone, relationship, address, notes, shareConsentAt },
    });

    return NextResponse.json({ message: "تم حفظ بيانات ولي الأمر", parentInfo });
  } catch (error) {
    console.error("Parent info error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}
