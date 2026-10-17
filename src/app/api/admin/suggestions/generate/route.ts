import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibility, mutuallyAcceptable } from "@/lib/matching/score";
import { MAX_OPEN_SUGGESTIONS, minSuggestionScore, openCounts, weeklyCounts } from "@/lib/matching/auto-suggest";
import { notify } from "@/lib/notify";
import { MUTUAL_SUGGESTION_MS } from "@/lib/suggestions/mutual";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { notifyCreditsExhausted, recordCredit, reserveCredits, WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { isTestPhone } from "@/lib/test-accounts";
import { getCycleFlags } from "@/lib/settings";

export async function POST() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const flags = await getCycleFlags();
    const { introRequests: perRequestCredits, mutualSuggestions: mutual, creditOnInterest } = flags;

    // Eligible: active users who pass the same suggestion gate as auto-suggest
    // (new cycle: completed short setup; legacy: ≥ 50% completeness).
    // Flagged users are left out on both sides (they neither receive nor are suggested);
    // an admin can still hand-pick them in Manage User.
    const eligibleUsers = (
      await db.user.findMany({
        where: {
          role: "USER",
          isDeactivated: false,
          status: { not: "SUSPENDED" },
          isFlagged: false,
          profile: { isComplete: true },
        },
        select: {
          id: true,
          gender: true,
          phone: true,
          matchCredits: true,
          profile: true,
          personalityResult: { select: { vector: true, personalityType: true } },
          photos: { select: { id: true } },
          identityDoc: { select: { status: true } },
          parentInfo: { select: { id: true, parentName: true } },
        },
      })
    ).filter((u) => meetsSuggestionGate(u, perRequestCredits));

    // Get existing suggestions and matches to avoid duplicates
    const existingSuggestions = await db.suggestion.findMany({
      select: { recipientId: true, candidateId: true },
    });
    const existingPairs = new Set(
      existingSuggestions.map((s) => `${s.recipientId}:${s.candidateId}`)
    );

    const existingMatches = await db.mutualMatch.findMany({
      select: { femaleId: true, maleId: true },
    });
    const matchPairs = new Set(
      existingMatches.flatMap((m) => [`${m.femaleId}:${m.maleId}`, `${m.maleId}:${m.femaleId}`])
    );

    // Get all blocks
    const blocks = await db.block.findMany({
      select: { blockerId: true, blockedId: true },
    });
    const blockPairs = new Set(
      blocks.flatMap((b) => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    let suggestionsCreated = 0;
    const MAX_SUGGESTIONS_PER_USER = 3;

    // Per-request mode: suggestions are free, capped per rolling 7 days
    // Simultaneous flow: MUTUAL rows (both decide), counted on either side, dealbreakers as hard filters
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = perRequestCredits && !mutual
      ? await db.suggestion.groupBy({ by: ["recipientId"], where: { createdAt: { gte: weekAgo } }, _count: true })
      : [];
    // Credit-on-interest: no weekly cap; each person holds up to MAX_OPEN_SUGGESTIONS undecided ones
    const thisWeekByUser = creditOnInterest
      ? await openCounts(eligibleUsers.map((u) => u.id))
      : mutual
      ? await weeklyCounts(eligibleUsers.map((u) => u.id), weekAgo)
      : new Map(thisWeek.map((r) => [r.recipientId, r._count]));

    for (const user of eligibleUsers) {
      // Find candidates of opposite gender
      const candidates = eligibleUsers.filter((c) => {
        if (c.id === user.id) return false;
        if (c.gender === user.gender) return false;
        // Test accounts only meet each other (lib/test-accounts)
        if (isTestPhone(c.phone) !== isTestPhone(user.phone)) return false;
        // Skip if already suggested (either direction)
        if (existingPairs.has(`${user.id}:${c.id}`)) return false;
        if (existingPairs.has(`${c.id}:${user.id}`)) return false;
        // Skip if already matched
        if (matchPairs.has(`${user.id}:${c.id}`)) return false;
        // Skip if blocked
        if (blockPairs.has(`${user.id}:${c.id}`)) return false;
        if (mutual && (thisWeekByUser.get(c.id) ?? 0) >= (creditOnInterest ? MAX_OPEN_SUGGESTIONS : WEEKLY_FREE_SUGGESTIONS)) return false;
        if (mutual && !mutuallyAcceptable(user, c)) return false;
        return true;
      });

      // Score and sort
      const scored = candidates.map((c) => ({
        candidate: c,
        score: calculateCompatibility(user, c),
      }));
      scored.sort((a, b) => b.score - a.score);

      // Take top N — limited by credits (legacy: 1 credit per suggestion) or by the weekly cap
      const limit = creditOnInterest
        ? MAX_OPEN_SUGGESTIONS - (thisWeekByUser.get(user.id) ?? 0)
        : perRequestCredits
          ? WEEKLY_FREE_SUGGESTIONS - (thisWeekByUser.get(user.id) ?? 0)
          : user.matchCredits;
      const topCandidates = creditOnInterest
        ? scored.filter((r) => r.score >= minSuggestionScore(flags)).slice(0, Math.max(0, limit))
        : scored.slice(0, Math.min(MAX_SUGGESTIONS_PER_USER, Math.max(0, limit)));
      let createdForUser = 0;

      for (const { candidate, score } of topCandidates) {
        if (score < minSuggestionScore(flags)) continue; // Skip very low scores
        if (!perRequestCredits && !(await reserveCredits(user.id, 1))) break;

        await db.suggestion.create({
          data: {
            recipientId: user.id,
            candidateId: candidate.id,
            compatibilityScore: score,
            source: "AI",
            ...(mutual && { flow: "MUTUAL" as const, expiresAt: new Date(Date.now() + MUTUAL_SUGGESTION_MS) }),
          },
        });

        // Mark this pair as suggested to avoid duplicates within this run
        existingPairs.add(`${user.id}:${candidate.id}`);

        if (mutual) {
          existingPairs.add(`${candidate.id}:${user.id}`);
          thisWeekByUser.set(user.id, (thisWeekByUser.get(user.id) ?? 0) + 1);
          thisWeekByUser.set(candidate.id, (thisWeekByUser.get(candidate.id) ?? 0) + 1);
          for (const userId of [user.id, candidate.id]) {
            await notify({
              userId,
              type: "SUGGESTION",
              title: "اقتراح توافق جديد",
              body: "لديك اقتراح توافق جديد. قم بمراجعته.",
              url: "/dashboard/suggestions",
            });
          }
          suggestionsCreated++;
          createdForUser++;
          continue;
        }

        await notify({
          userId: user.id,
          type: "SUGGESTION",
          title: "اقتراح توافق جديد",
          body: "لديك اقتراح توافق جديد. قم بمراجعته.",
          url: "/dashboard/suggestions",
        });

        suggestionsCreated++;
        createdForUser++;
      }

      if (!perRequestCredits && createdForUser > 0) {
        await recordCredit({
          userId: user.id,
          delta: -createdForUser,
          reason: "SUGGESTION",
          adminId: session.user.id,
          note: "Admin Generate",
        });
      }
      if (!perRequestCredits && createdForUser > 0 && user.matchCredits - createdForUser <= 0) {
        await notifyCreditsExhausted(user.id);
      }
    }

    return NextResponse.json({
      message: `Generated ${suggestionsCreated} suggestions`,
      count: suggestionsCreated,
    });
  } catch (error) {
    console.error("Generate suggestions error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
