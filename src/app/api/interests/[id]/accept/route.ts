import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotificationToMany } from "@/lib/onesignal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    if (session.user.gender !== "MALE") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

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

    // Create male's like back
    await db.like.create({
      data: {
        fromUserId: session.user.id,
        toUserId: incomingLike.fromUserId,
        suggestionId: incomingLike.suggestionId,
        isLiked: true,
      },
    });

    // This creates a mutual match!
    const femaleId = incomingLike.fromUserId;
    const maleId = session.user.id;

    const match = await db.mutualMatch.create({
      data: {
        femaleId,
        maleId,
        suggestionId: incomingLike.suggestionId,
        revealedByFemale: false,
      },
    });

    // Create visit request
    await db.visitRequest.create({
      data: { matchId: match.id },
    });

    // Notify both users
    await db.notification.createMany({
      data: [
        {
          userId: femaleId,
          type: "MATCH",
          title: "توافق متبادل!",
          body: "تهانينا! لديك توافق متبادل جديد. استخدمي رصيد التوافق لرؤية التفاصيل.",
        },
        {
          userId: maleId,
          type: "MATCH",
          title: "توافق متبادل!",
          body: "تهانينا! لديك توافق متبادل جديد. يمكنك الآن رؤية التفاصيل.",
        },
      ],
    });

    // Push notifications
    sendPushNotificationToMany([femaleId, maleId], {
      title: "توافق متبادل!",
      body: "تهانينا! لديك توافق متبادل جديد.",
      url: "/dashboard/matches",
    });

    return NextResponse.json({
      message: "تم قبول الاهتمام! لديك توافق متبادل!",
      match: true,
    });
  } catch (error) {
    console.error("Accept interest error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
