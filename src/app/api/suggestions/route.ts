import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const suggestions = await db.suggestion.findMany({
      where: {
        femaleId: session.user.id,
        status: "PENDING",
      },
      include: {
        male: {
          select: {
            id: true,
            firstName: true,
            profile: {
              select: {
                city: true,
                education: true,
                job: true,
                dateOfBirth: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedSuggestions = suggestions.map((s) => {
      const age = s.male.profile?.dateOfBirth
        ? Math.floor((Date.now() - new Date(s.male.profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      return {
        id: s.id,
        compatibilityScore: s.compatibilityScore,
        source: s.source,
        createdAt: s.createdAt,
        candidate: {
          firstName: s.male.firstName,
          age,
          city: s.male.profile?.city,
          education: s.male.profile?.education,
          job: s.male.profile?.job,
        },
      };
    });

    return NextResponse.json({
      suggestions: formattedSuggestions,
    });
  } catch (error) {
    console.error("Suggestions error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
