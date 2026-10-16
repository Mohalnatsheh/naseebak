import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibilityDetailed } from "@/lib/matching/score";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { getCycleFlags } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10") || 10));

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Fetch target user with scoring data
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        profile: true,
        personalityResult: { select: { vector: true } },
        photos: { select: { id: true } },
        identityDoc: { select: { status: true } },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch eligible opposite-gender users
    const oppositeGender = targetUser.gender === "MALE" ? "FEMALE" : "MALE";
    // Same gate as auto-suggest and Generate; suspended users are never candidates
    const { introRequests } = await getCycleFlags();
    const eligibleUsers = (
      await db.user.findMany({
        where: {
          role: "USER",
          isDeactivated: false,
          status: { not: "SUSPENDED" },
          gender: oppositeGender,
          profile: { isComplete: true },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gender: true,
          profile: true,
          personalityResult: { select: { vector: true, personalityType: true } },
          photos: { select: { id: true } },
          identityDoc: { select: { status: true } },
          parentInfo: { select: { id: true, parentName: true } },
        },
      })
    ).filter((u) => meetsSuggestionGate(u, introRequests));

    // Build exclusion awareness sets
    const [existingSuggestions, existingMatches, blocks] = await Promise.all([
      db.suggestion.findMany({
        where: {
          OR: [{ recipientId: userId }, { candidateId: userId }],
        },
        select: { recipientId: true, candidateId: true },
      }),
      db.mutualMatch.findMany({
        where: {
          OR: [{ femaleId: userId }, { maleId: userId }],
        },
        select: { femaleId: true, maleId: true },
      }),
      db.block.findMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const suggestedPairs = new Set<string>();
    for (const s of existingSuggestions) {
      suggestedPairs.add(s.recipientId === userId ? s.candidateId : s.recipientId);
    }

    const matchedIds = new Set<string>();
    for (const m of existingMatches) {
      matchedIds.add(m.femaleId === userId ? m.maleId : m.femaleId);
    }

    const blockedIds = new Set<string>();
    for (const b of blocks) {
      blockedIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }

    // Score all candidates with detailed breakdowns
    const scored = eligibleUsers
      .filter((c) => !blockedIds.has(c.id) && !matchedIds.has(c.id))
      .map((candidate) => {
        const breakdown = calculateCompatibilityDetailed(
          targetUser as any,
          candidate as any
        );
        return {
          user: {
            id: candidate.id,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            gender: candidate.gender,
            profile: candidate.profile
              ? {
                  city: candidate.profile.city,
                  education: candidate.profile.education,
                  maritalStatus: candidate.profile.maritalStatus,
                }
              : null,
          },
          breakdown,
          alreadySuggested: suggestedPairs.has(candidate.id),
        };
      });

    // Sort by score descending
    scored.sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore);

    return NextResponse.json({
      user: {
        id: targetUser.id,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        gender: targetUser.gender,
        profile: targetUser.profile
          ? { city: (targetUser.profile as any).city }
          : null,
      },
      candidates: scored.slice(0, limit),
      total: scored.length,
    });
  } catch (error) {
    console.error("Admin candidates error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
