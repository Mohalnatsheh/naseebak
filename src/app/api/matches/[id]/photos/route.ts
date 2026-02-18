import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;

    const match = await db.mutualMatch.findUnique({
      where: { id },
      include: {
        female: { select: { id: true, photos: { select: { id: true, url: true, order: true }, orderBy: { order: "asc" } } } },
        male: { select: { id: true, photos: { select: { id: true, url: true, order: true }, orderBy: { order: "asc" } } } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    if (match.femaleId !== session.user.id && match.maleId !== session.user.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const otherPhotos = match.femaleId === session.user.id ? match.male.photos : match.female.photos;

    return NextResponse.json({ photos: otherPhotos });
  } catch (error) {
    console.error("Match photos error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
