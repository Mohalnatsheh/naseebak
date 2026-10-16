import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
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
    const likeData = {
      fromUserId: session.user.id,
      toUserId: incomingLike.fromUserId,
      suggestionId: incomingLike.suggestionId,
      isLiked: true,
    };
    if ((await getCycleFlags()).creditOnInterest) {
      // Credit on interest: accepting is the "مهتم" — the like back and the 1-credit charge commit together
      // (a concurrent second accept fails on the unique like and its charge rolls back)
      await db.$transaction(async (tx) => {
        await tx.like.create({ data: likeData });
        if (!(await reserveCredits(session.user.id, 1, tx))) throw new IntroError("NO_CREDITS");
        await recordCredit(
          { userId: session.user.id, delta: -1, reason: "INTEREST", refId: incomingLike.suggestionId ?? incomingLike.id },
          tx
        );
      });
      const me = await db.user.findUnique({ where: { id: session.user.id }, select: { matchCredits: true } });
      if ((me?.matchCredits ?? 0) <= 0) {
        await notifyInterestCreditsExhausted(session.user.id).catch((e) => console.error("Accept interest: exhausted notice", e));
      }
    } else {
      await db.like.create({ data: likeData });
    }

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
    return introErrorResponse(error, "Accept interest");
  }
}
