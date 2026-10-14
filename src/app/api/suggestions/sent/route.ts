import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    const where = {
      recipientId: session.user.id,
      status: "ACCEPTED" as const,
    };

    const [suggestions, total] = await Promise.all([
      db.suggestion.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              isVerified: true,
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
        skip,
        take: pageSize,
      }),
      db.suggestion.count({ where }),
    ]);

    if (suggestions.length === 0) {
      return NextResponse.json({ sentRequests: [], page, totalPages: Math.ceil(total / pageSize), total });
    }

    // Batch-fetch INTEREST notifications for page items
    const suggestionIds = suggestions.map((s) => s.id);
    const candidateIds = suggestions.map((s) => s.candidateId);

    const [notifications, mutualMatches] = await Promise.all([
      db.notification.findMany({
        where: {
          type: "INTEREST",
          userId: { in: candidateIds },
        },
        select: {
          userId: true,
          isRead: true,
          metadata: true,
        },
      }),
      db.mutualMatch.findMany({
        where: {
          OR: [
            { femaleId: session.user.id, maleId: { in: candidateIds } },
            { maleId: session.user.id, femaleId: { in: candidateIds } },
          ],
        },
        select: {
          femaleId: true,
          maleId: true,
        },
      }),
    ]);

    // Build lookup maps
    const matchedCandidateIds = new Set(
      mutualMatches.map((m) =>
        m.femaleId === session.user.id ? m.maleId : m.femaleId
      )
    );

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
      const age = s.candidate.profile?.dateOfBirth
        ? Math.floor(
            (Date.now() - new Date(s.candidate.profile.dateOfBirth).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      let status: "waiting" | "seen" | "matched";
      if (matchedCandidateIds.has(s.candidateId)) {
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
          firstName: s.candidate.firstName,
          isVerified: s.candidate.isVerified,
          age,
          city: s.candidate.profile?.city ?? null,
          education: s.candidate.profile?.education ?? null,
          job: s.candidate.profile?.job ?? null,
        },
      };
    });

    return NextResponse.json({ sentRequests, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (error) {
    console.error("Sent suggestions error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
