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

    // Only females need to reveal matches
    if (session.user.gender !== "FEMALE") {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { id } = await params;

    const match = await db.mutualMatch.findUnique({ where: { id } });
    if (!match || match.femaleId !== session.user.id) {
      return NextResponse.json({ error: "التوافق غير موجود" }, { status: 404 });
    }

    if (match.revealedByFemale) {
      return NextResponse.json({ message: "تم الكشف مسبقاً", revealed: true });
    }

    // Check credits
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { matchCredits: true },
    });

    if (!user || user.matchCredits <= 0) {
      return NextResponse.json(
        {
          error: "ليس لديك رصيد كافٍ. اشتري رصيد توافق لرؤية التفاصيل.",
          code: "NO_CREDITS",
        },
        { status: 403 }
      );
    }

    // Deduct 1 credit and reveal match
    await db.$transaction([
      db.user.update({
        where: { id: session.user.id },
        data: { matchCredits: { decrement: 1 } },
      }),
      db.mutualMatch.update({
        where: { id },
        data: { revealedByFemale: true },
      }),
    ]);

    return NextResponse.json({
      message: "تم الكشف عن التوافق بنجاح",
      revealed: true,
      creditsRemaining: user.matchCredits - 1,
    });
  } catch (error) {
    console.error("Reveal error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
