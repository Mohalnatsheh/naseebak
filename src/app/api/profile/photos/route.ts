import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const photos = await db.photo.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        url: true,
        isPrimary: true,
        order: true,
        createdAt: true,
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Photos get error:", error);
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
    const { photoData, isPrimary } = body;

    if (!photoData) {
      return NextResponse.json({ error: "بيانات الصورة مطلوبة" }, { status: 400 });
    }

    const count = await db.photo.count({ where: { userId: session.user.id } });
    if (count >= 5) {
      return NextResponse.json({ error: "الحد الأقصى 5 صور" }, { status: 400 });
    }

    // If this photo is set as primary, unset other primary photos
    if (isPrimary) {
      await db.photo.updateMany({
        where: { userId: session.user.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const photo = await db.photo.create({
      data: {
        userId: session.user.id,
        url: photoData, // In production: upload to cloud storage
        isPrimary: isPrimary || count === 0, // First photo is primary by default
        order: count,
      },
    });

    return NextResponse.json({ message: "تم رفع الصورة", photo });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
