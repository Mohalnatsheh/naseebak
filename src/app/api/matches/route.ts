import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const isFemale = session.user.gender === "FEMALE";

    const matches = await db.mutualMatch.findMany({
      where: {
        OR: [
          { femaleId: session.user.id },
          { maleId: session.user.id },
        ],
      },
      include: {
        female: {
          select: { id: true, firstName: true, profile: { select: { city: true, education: true, job: true } } },
        },
        male: {
          select: { id: true, firstName: true, profile: { select: { city: true, education: true, job: true } } },
        },
        visitRequest: {
          select: { status: true, scheduledDate: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get user's current credits if female
    let matchCredits = 0;
    if (isFemale) {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { matchCredits: true },
      });
      matchCredits = user?.matchCredits ?? 0;
    }

    const formatted = matches.map((m) => {
      const otherUser = m.femaleId === session.user.id ? m.male : m.female;
      const revealed = isFemale ? m.revealedByFemale : true; // Males always see matches

      return {
        id: m.id,
        photosRevealed: m.photosRevealed,
        revealed,
        createdAt: m.createdAt,
        visitStatus: m.visitRequest?.status || null,
        scheduledDate: m.visitRequest?.scheduledDate || null,
        partner: revealed
          ? {
              id: otherUser.id,
              firstName: otherUser.firstName,
              city: otherUser.profile?.city,
              education: otherUser.profile?.education,
              job: otherUser.profile?.job,
            }
          : {
              id: otherUser.id,
              firstName: otherUser.firstName,
              city: null,
              education: null,
              job: null,
            },
      };
    });

    return NextResponse.json({
      matches: formatted,
      matchCredits: isFemale ? matchCredits : undefined,
    });
  } catch (error) {
    console.error("Matches error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
