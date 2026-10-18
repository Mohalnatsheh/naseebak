import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { autoSuggestForUser, minSuggestionScore } from "@/lib/matching/auto-suggest";
import { notify } from "@/lib/notify";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { notifyCreditsExhausted, recordCredit, reserveCredits, WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { isTestPhone } from "@/lib/test-accounts";
import { getCycleFlags } from "@/lib/settings";
import { activeWhere } from "@/lib/activity";

/**
 * Shared suggestions on (`new_suggestions_flow`, with or without `credit_on_interest`): the same run
 * as the automatic top-up, for every user who could get one. `autoSuggestForUser` applies every new-cycle
 * rule (active, not engaged, open cap / weekly cap, min score, dealbreakers, a full candidate gets the
 * card hidden instead of being skipped, re-suggest rules) and sends at most one notice a day per person.
 */
async function generateSharedSuggestions(): Promise<{ created: number; users: number; failed: number }> {
  const users = await db.user.findMany({
    where: {
      role: "USER",
      isDeactivated: false,
      status: { not: "SUSPENDED" },
      isFlagged: false,
      profile: { isComplete: true },
      ...activeWhere(30),
    },
    select: { id: true },
    orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
  });
  let created = 0;
  let failed = 0;
  // One at a time: each run re-reads everyone's open counts, so later users see the cards made before
  for (const u of users) {
    try {
      created += await autoSuggestForUser(u.id);
    } catch (error) {
      failed++;
      console.error("[admin generate] suggestions for", u.id, error);
    }
  }
  return { created, users: users.length, failed };
}

export async function POST() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const flags = await getCycleFlags();
    const { introRequests: perRequestCredits, mutualSuggestions: mutual } = flags;

    if (mutual) {
      const { created, failed } = await generateSharedSuggestions();
      return NextResponse.json({
        message: `Generated ${created} suggestions${failed > 0 ? ` (${failed} users failed, see logs)` : ""}`,
        count: created,
      });
    }

    // Older flows below (shared suggestions off): legacy and per-request mode

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
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = perRequestCredits
      ? await db.suggestion.groupBy({ by: ["recipientId"], where: { createdAt: { gte: weekAgo } }, _count: true })
      : [];
    const thisWeekByUser = new Map(thisWeek.map((r) => [r.recipientId, r._count]));

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
        return true;
      });

      // Score and sort
      const scored = candidates.map((c) => ({
        candidate: c,
        score: calculateCompatibility(user, c),
      }));
      scored.sort((a, b) => b.score - a.score);

      // Take top N — limited by credits (legacy: 1 credit per suggestion) or by the weekly cap
      const limit = perRequestCredits
        ? WEEKLY_FREE_SUGGESTIONS - (thisWeekByUser.get(user.id) ?? 0)
        : user.matchCredits;
      const topCandidates = scored.slice(0, Math.min(MAX_SUGGESTIONS_PER_USER, Math.max(0, limit)));
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
          },
        });

        // Mark this pair as suggested to avoid duplicates within this run
        existingPairs.add(`${user.id}:${candidate.id}`);

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
