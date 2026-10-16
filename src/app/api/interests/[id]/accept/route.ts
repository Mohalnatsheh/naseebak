import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMutualMatch } from "@/lib/intro/match";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { id } = await params;

    // Find the incoming like
    const incomingLike = await db.like.findUnique({
      where: { id },
      include: { fromUser: { select: { id: true, firstName: true } } },
    });

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

    // Create the user's like back
    await db.like.create({
      data: {
        fromUserId: session.user.id,
        toUserId: incomingLike.fromUserId,
        suggestionId: incomingLike.suggestionId,
        isLiked: true,
      },
    });

    // Determine femaleId/maleId from actual user genders for MutualMatch
    const [currentUser] = await Promise.all([
      db.user.findUnique({ where: { id: session.user.id }, select: { gender: true } }),
      db.user.findUnique({ where: { id: incomingLike.fromUserId }, select: { gender: true } }),
    ]);
    const femaleId = currentUser?.gender === "FEMALE" ? session.user.id : incomingLike.fromUserId;
    const maleId = currentUser?.gender === "MALE" ? session.user.id : incomingLike.fromUserId;

    await createMutualMatch({ femaleId, maleId, suggestionId: incomingLike.suggestionId });

    return NextResponse.json({
      message: "تم قبول الاهتمام! لديك توافق متبادل!",
      match: true,
    });
  } catch (error) {
    console.error("Accept interest error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
