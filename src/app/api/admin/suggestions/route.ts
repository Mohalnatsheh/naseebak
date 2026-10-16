import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { parsePagination } from "@/lib/utils";
import { getCycleFlags } from "@/lib/settings";
import type { Prisma } from "@prisma/client";
import { notifyMany } from "@/lib/notify";
import { MUTUAL_SUGGESTION_MS } from "@/lib/suggestions/mutual";
import { checkSuggestionPair } from "@/lib/admin/suggestion-pair";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams, 20);
    const rawStatus = url.searchParams.get("status") || "";
    const status = ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"].includes(rawStatus) ? rawStatus : "";

    // Shared (MUTUAL) suggestions expire lazily: a PENDING row past expiresAt is shown as EXPIRED
    const now = new Date();
    const where: Prisma.SuggestionWhereInput =
      status === "EXPIRED"
        ? { OR: [{ status: "EXPIRED" }, { status: "PENDING", expiresAt: { lt: now } }] }
        : status === "PENDING"
          ? { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
          : status
            ? { status: status as "ACCEPTED" | "REJECTED" }
            : {};

    const [suggestions, total, flags] = await Promise.all([
      db.suggestion.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          compatibilityScore: true,
          status: true,
          source: true,
          createdAt: true,
          flow: true,
          expiresAt: true,
          recipientDecision: true,
          candidateDecision: true,
          recipient: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
          candidate: {
            select: { id: true, firstName: true, lastName: true, gender: true },
          },
        },
      }),
      db.suggestion.count({ where }),
      getCycleFlags(),
    ]);

    return NextResponse.json({
      flags,
      suggestions,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin suggestions list error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

const scoringSelect = {
  id: true,
  gender: true,
  profile: true,
  personalityResult: { select: { vector: true } },
  photos: { select: { id: true } },
  identityDoc: { select: { status: true } },
} as const;

/** Admin hand-picked suggestion. Free in every mode; refused for pairs that could never be suggested. */
export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;

    const body = await request.json().catch(() => ({}));
    const { recipientId, candidateId, compatibilityScore: manualScore } = body as {
      recipientId?: string;
      candidateId?: string;
      compatibilityScore?: number;
    };

    if (!recipientId || !candidateId) {
      return NextResponse.json({ error: "Pick both people" }, { status: 400 });
    }
    if (manualScore != null && (typeof manualScore !== "number" || manualScore < 0 || manualScore > 100)) {
      return NextResponse.json({ error: "Score must be between 0 and 100" }, { status: 400 });
    }

    const refused = await checkSuggestionPair(recipientId, candidateId);
    if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });

    let score = manualScore;
    if (score == null) {
      const [userA, userB] = await Promise.all([
        db.user.findUnique({ where: { id: recipientId }, select: scoringSelect }),
        db.user.findUnique({ where: { id: candidateId }, select: scoringSelect }),
      ]);
      try {
        score = userA && userB ? calculateCompatibility(userA as any, userB as any) : undefined;
      } catch (error) {
        console.error("Admin suggestion scoring failed:", error);
      }
      if (score == null || Number.isNaN(score)) {
        return NextResponse.json(
          { error: "Could not calculate the compatibility score — check both profiles, or enter a score" },
          { status: 422 }
        );
      }
    }

    // Simultaneous flow: both people see the suggestion and decide
    const { mutualSuggestions } = await getCycleFlags();
    const suggestion = await db.suggestion.create({
      data: {
        recipientId,
        candidateId,
        compatibilityScore: score,
        source: "ADMIN",
        ...(mutualSuggestions && { flow: "MUTUAL" as const, expiresAt: new Date(Date.now() + MUTUAL_SUGGESTION_MS) }),
      },
    });
    await notifyMany(mutualSuggestions ? [recipientId, candidateId] : [recipientId], {
      type: "SUGGESTION",
      title: "اقتراح جديد من الإدارة",
      body: "لديك اقتراح توافق جديد من فريق نصيبك. قم بمراجعته.",
      url: "/dashboard/suggestions",
    });

    return NextResponse.json({ message: "Suggestion created", suggestion });
  } catch (error) {
    console.error("Admin suggestion error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
