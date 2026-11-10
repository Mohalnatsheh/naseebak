import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { minSuggestionScore } from "@/lib/matching/auto-suggest";
import { currentGenerateJob, startGenerateJob } from "@/lib/admin/generate-job";
import { notify } from "@/lib/notify";
import { meetsSuggestionGate } from "@/lib/profile-completeness";
import { notifyCreditsExhausted, recordCredit, reserveCredits, WEEKLY_FREE_SUGGESTIONS } from "@/lib/credits";
import { isTestPhone } from "@/lib/test-accounts";
import { getCycleFlags } from "@/lib/settings";
import { getAdminCountry, userCountryWhere } from "@/lib/countries/server";

/**
 * Shared suggestions on (`new_suggestions_flow`): the same run as the automatic top-up (`autoSuggestForUser` applies
 * every new-cycle rule and sends at most one notice a day per person), as a capped background task (QA ADM-10):
 * POST starts it and answers 202 with the job; GET reads the progress. See src/lib/admin/generate-job.ts.
 */
export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;
  return NextResponse.json({ job: currentGenerateJob() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const country = await getAdminCountry(request);
    const flags = await getCycleFlags();
    const { introRequests: perRequestCredits, mutualSuggestions: mutual } = flags;

    if (mutual) {
      const { job, started, run } = await startGenerateJob(country, session.user.id);
      void run;
      if (!started) {
        return NextResponse.json(
          { error: "A run is already going", code: "ALREADY_RUNNING", job },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          started: true,
          job,
          message: `Started for ${job.total} members${job.eligible > job.total ? ` (the ${job.total} most recently active of ${job.eligible})` : ""}`,
        },
        { status: 202 },
      );
    }

    // Older flows below (shared suggestions off): legacy and per-request mode

    // Eligible: active users who pass the same suggestion gate as auto-suggest
    // (new cycle: completed short setup; legacy: ≥ 50% completeness).
    // Flagged users are left out on both sides (they neither receive nor are suggested);
    // an admin can still hand-pick them in Manage User.
    const eligibleUsers = (
      await db.user.findMany({
        where: {
          ...userCountryWhere(country),
          role: "USER",
          isDeactivated: false,
          status: { not: "SUSPENDED" },
          isFlagged: false,
          profile: { isComplete: true },
        },
        select: {
          id: true,
          gender: true,
          country: true,
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
        // Same country only (a future `cross_country_matching` setting will lift this)
        if (c.country !== user.country) return false;
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
        if (score < minSuggestionScore(flags, user.country)) continue; // Skip very low scores
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
          body: "لديك اقتراح توافق جديد. يمكنك الاطلاع عليه الآن.",
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
