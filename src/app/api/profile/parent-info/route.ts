import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();
    const { parentName, parentPhone, relationship, address, notes } = body;

    if (!parentName || !parentPhone || !relationship) {
      return NextResponse.json({ error: "جميع الحقول المطلوبة يجب ملؤها" }, { status: 400 });
    }

    const parentInfo = await db.parentInfo.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, parentName, parentPhone, relationship, address, notes },
      update: { parentName, parentPhone, relationship, address, notes },
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
