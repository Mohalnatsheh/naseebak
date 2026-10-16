import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
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

    const suggestion = await db.suggestion.findUnique({ where: { id } });
    // Only the recipient can answer, and only once
    if (!suggestion || suggestion.recipientId !== session.user.id || suggestion.status !== "PENDING") {
      return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
    }

    // Update suggestion status
    await db.suggestion.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });

    // The recipient is the one liking; the candidate is the other user
    const otherUserId = suggestion.candidateId;

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
      // Determine femaleId/maleId from actual user genders for MutualMatch
      const currentUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { gender: true },
      });
      const femaleId = currentUser?.gender === "FEMALE" ? session.user.id : otherUserId;
      const maleId = currentUser?.gender === "MALE" ? session.user.id : otherUserId;

      await createMutualMatch({ femaleId, maleId, suggestionId: suggestion.id });

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

    // Push notification
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
