import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushNotification } from "@/lib/onesignal";
import { createMutualMatch } from "@/lib/intro/match";
import { notifyInterestCreditsExhausted, recordCredit, reserveCredits } from "@/lib/credits";
import { IntroError } from "@/lib/intro/errors";
import { introErrorResponse } from "@/lib/intro/http";
import { getCycleFlags } from "@/lib/settings";

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
    // Simultaneous (MUTUAL) suggestions are answered through /decide
    if (!suggestion || suggestion.flow !== "LEGACY" || suggestion.recipientId !== session.user.id || suggestion.status !== "PENDING") {
      return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
    }

    // The recipient is the one liking; the candidate is the other user
    const otherUserId = suggestion.candidateId;
    const likeData = { fromUserId: session.user.id, toUserId: otherUserId, suggestionId: suggestion.id, isLiked: true };

    if ((await getCycleFlags()).creditOnInterest) {
      // Credit on interest: this like is the "مهتم" — accept, charge 1 and record the like together
      // (a lost claim charges nothing; no credit rolls the acceptance back)
      // The balance is read inside the transaction so only the charge that reached 0 sends the notice
      const creditsLeft = await db.$transaction(async (tx) => {
        const accepted = await tx.suggestion.updateMany({
          where: { id, status: "PENDING", flow: "LEGACY" },
          data: { status: "ACCEPTED" },
        });
        if (accepted.count === 0) return null;
        if (!(await reserveCredits(session.user.id, 1, tx))) throw new IntroError("NO_CREDITS");
        await recordCredit({ userId: session.user.id, delta: -1, reason: "INTEREST", refId: suggestion.id }, tx);
        await tx.like.create({ data: likeData });
        const me = await tx.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { matchCredits: true } });
        return me.matchCredits;
      });
      if (creditsLeft === null) {
        return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
      }
      if (creditsLeft <= 0) {
        await notifyInterestCreditsExhausted(session.user.id).catch((e) => console.error("Like: exhausted notice", e));
      }
    } else {
      // Update suggestion status (only once, even with a double tap)
      const accepted = await db.suggestion.updateMany({
        where: { id, status: "PENDING", flow: "LEGACY" },
        data: { status: "ACCEPTED" },
      });
      if (accepted.count === 0) {
        return NextResponse.json({ error: "الاقتراح غير موجود" }, { status: 404 });
      }

      await db.like.create({ data: likeData });
    }

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
    return introErrorResponse(error, "Like");
  }
}
