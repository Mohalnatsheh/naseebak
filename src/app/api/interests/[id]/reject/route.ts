import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { id } = await params;

    // Find the incoming like
    const incomingLike = await db.like.findUnique({ where: { id } });

    if (!incomingLike || incomingLike.toUserId !== session.user.id) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }

    // Check if already responded
    const existing = await db.like.findUnique({
      where: {
        fromUserId_toUserId: {
          fromUserId: session.user.id,
          toUserId: incomingLike.fromUserId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "تم الرد على هذا الطلب مسبقاً" }, { status: 400 });
    }

    // Create male's rejection
    await db.like.create({
      data: {
        fromUserId: session.user.id,
        toUserId: incomingLike.fromUserId,
        suggestionId: incomingLike.suggestionId,
        isLiked: false,
      },
    });

    return NextResponse.json({ message: "تم رفض الطلب" });
  } catch (error) {
    console.error("Reject interest error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
