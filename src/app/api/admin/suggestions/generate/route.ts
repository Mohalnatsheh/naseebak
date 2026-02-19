import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateCompatibility } from "@/lib/matching/score";
import { sendPushNotification } from "@/lib/onesignal";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Find eligible users: verified, complete profile, not deactivated
    const eligibleUsers = await db.user.findMany({
      where: {
        role: "USER",
        isDeactivated: false,
        identityDoc: { status: "APPROVED" },
        profile: { isComplete: true },
      },
      select: {
        id: true,
        gender: true,
        profile: true,
        personalityResult: { select: { vector: true } },
        photos: { select: { id: true } },
        identityDoc: { select: { status: true } },
      },
    });

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

    for (const user of eligibleUsers) {
      // Find candidates of opposite gender
      const candidates = eligibleUsers.filter((c) => {
        if (c.id === user.id) return false;
        if (c.gender === user.gender) return false;
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
        score: calculateCompatibility(user as any, c as any),
      }));
      scored.sort((a, b) => b.score - a.score);

      // Take top N
      const topCandidates = scored.slice(0, MAX_SUGGESTIONS_PER_USER);

      for (const { candidate, score } of topCandidates) {
        if (score < 30) continue; // Skip very low scores

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

        // Notify the recipient
        await db.notification.create({
          data: {
            userId: user.id,
            type: "SUGGESTION",
            title: "اقتراح توافق جديد",
            body: "لديك اقتراح توافق جديد. قم بمراجعته.",
          },
        });

        sendPushNotification({
          userId: user.id,
          title: "اقتراح توافق جديد",
          body: "لديك اقتراح توافق جديد. قم بمراجعته.",
          url: "/dashboard/suggestions",
        });

        suggestionsCreated++;
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
