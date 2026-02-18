import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification, sendPushNotificationToMany } from "@/lib/onesignal";

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

    const suggestion = await db.suggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
    }

    // Update suggestion status
    await db.suggestion.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });

    // Create a Like record
    const otherUserId = session.user.gender === "FEMALE" ? suggestion.maleId : suggestion.femaleId;

    await db.like.create({
      data: {
        fromUserId: session.user.id,
        toUserId: otherUserId,
        suggestionId: suggestion.id,
        isLiked: true,
      },
    });

    // Check for mutual like
    const mutualLike = await db.like.findUnique({
      where: {
        fromUserId_toUserId: {
          fromUserId: otherUserId,
          toUserId: session.user.id,
        },
      },
    });

    if (mutualLike && mutualLike.isLiked) {
      // Create mutual match
      const femaleId = session.user.gender === "FEMALE" ? session.user.id : otherUserId;
      const maleId = session.user.gender === "MALE" ? session.user.id : otherUserId;

      const match = await db.mutualMatch.create({
        data: {
          femaleId,
          maleId,
          suggestionId: suggestion.id,
          revealedByFemale: false, // Female must spend credit to reveal
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
        message: "تم قبول الاقتراح! لديك توافق متبادل!",
        match: true,
      });
    }

    // Notify the other user about the interest
    await db.notification.create({
      data: {
        userId: otherUserId,
        type: "INTEREST",
        title: "شخص مهتم بك!",
        body: "هناك شخص أبدى اهتمامه بملفك. راجع طلبات الاهتمام وقرر.",
        metadata: { suggestionId: suggestion.id },
      },
    });

    // Push notification — link to suggestions page where males see interests
    sendPushNotification({
      userId: otherUserId,
      title: "شخص مهتم بك!",
      body: "هناك شخص أبدى اهتمامه بملفك.",
      url: "/dashboard/suggestions",
    });

    return NextResponse.json({ message: "تم قبول الاقتراح", match: false });
  } catch (error) {
    console.error("Like error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
