import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Only females send interest via accepted suggestions
    if (session.user.gender !== "FEMALE") {
      return NextResponse.json({ sentRequests: [] });
    }

    const suggestions = await db.suggestion.findMany({
      where: {
        femaleId: session.user.id,
        status: "ACCEPTED",
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
      orderBy: { updatedAt: "desc" },
    });

    if (suggestions.length === 0) {
      return NextResponse.json({ sentRequests: [] });
    }

    // Batch-fetch INTEREST notifications for all suggestion IDs
    const suggestionIds = suggestions.map((s) => s.id);
    const maleIds = suggestions.map((s) => s.maleId);

    const [notifications, mutualMatches] = await Promise.all([
      db.notification.findMany({
        where: {
          type: "INTEREST",
          userId: { in: maleIds },
        },
        select: {
          userId: true,
          isRead: true,
          metadata: true,
        },
      }),
      db.mutualMatch.findMany({
        where: {
          femaleId: session.user.id,
          maleId: { in: maleIds },
        },
        select: {
          maleId: true,
        },
      }),
    ]);

    // Build lookup maps
    const matchedMaleIds = new Set(mutualMatches.map((m) => m.maleId));

    // Map notification by suggestionId for quick lookup
    const notificationBySuggestionId = new Map<string, boolean>();
    for (const n of notifications) {
      const meta = n.metadata as Record<string, unknown> | null;
      const sid = meta?.suggestionId as string | undefined;
      if (sid && suggestionIds.includes(sid)) {
        notificationBySuggestionId.set(sid, n.isRead);
      }
    }

    const sentRequests = suggestions.map((s) => {
      const age = s.male.profile?.dateOfBirth
        ? Math.floor(
            (Date.now() - new Date(s.male.profile.dateOfBirth).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      let status: "waiting" | "seen" | "matched";
      if (matchedMaleIds.has(s.maleId)) {
        status = "matched";
      } else if (notificationBySuggestionId.get(s.id) === true) {
        status = "seen";
      } else {
        status = "waiting";
      }

      return {
        id: s.id,
        status,
        sentAt: s.updatedAt,
        candidate: {
          firstName: s.male.firstName,
          age,
          city: s.male.profile?.city ?? null,
          education: s.male.profile?.education ?? null,
          job: s.male.profile?.job ?? null,
        },
      };
    });

    return NextResponse.json({ sentRequests });
  } catch (error) {
    console.error("Sent suggestions error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
