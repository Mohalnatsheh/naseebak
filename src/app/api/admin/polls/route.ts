import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextPollSlug, pollRewardCredits, pollRoundDays, pollsEnabled, rotateAllPolls, TEST_SOURCE } from "@/lib/engagement/polls";
import { pollInputSchema } from "@/lib/validations/poll";
import { getAdminCountry } from "@/lib/admin/country-filter";

/**
 * Every question of the country in the admin bar, newest first, with its counted votes and `allVotes` (test accounts too: any vote at
 * all blocks deleting a question), plus the settings (a due rotation runs first)
 */
export async function GET(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    await rotateAllPolls().catch((error) => console.error("[admin polls] rotation failed:", error));
    const country = await getAdminCountry(request);
    const [polls, counts, allCounts, enabled, roundDays, rewardCredits, rewarded] = await Promise.all([
      db.poll.findMany({ where: country === "ALL" ? {} : { country }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.pollVote.groupBy({ by: ["pollId"], where: { source: { not: TEST_SOURCE } }, _count: { _all: true } }),
      db.pollVote.groupBy({ by: ["pollId"], _count: { _all: true } }),
      pollsEnabled(),
      pollRoundDays(),
      pollRewardCredits(),
      db.pollVote.aggregate({ _sum: { rewardCredits: true } }),
    ]);
    const votes = new Map(counts.map((c) => [c.pollId, c._count._all]));
    const allVotes = new Map(allCounts.map((c) => [c.pollId, c._count._all]));
    return NextResponse.json({
      enabled,
      adminCountry: country,
      roundDays,
      rewardCredits,
      creditsGiven: rewarded._sum.rewardCredits ?? 0,
      polls: polls.map((p) => ({ ...p, votes: votes.get(p.id) ?? 0, allVotes: allVotes.get(p.id) ?? 0 })),
    });
  } catch (error) {
    console.error("[admin polls] list failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** New question, saved as a draft */
export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const parsed = pollInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid poll" }, { status: 400 });
    const { question, options, note, country } = parsed.data;
    const poll = await db.poll.create({
      data: {
        slug: await nextPollSlug(),
        country: country ?? "JO",
        question,
        note: note ?? null,
        options: options.map((label, i) => ({ id: `o${i + 1}`, label })),
      },
    });
    return NextResponse.json({ poll }, { status: 201 });
  } catch (error) {
    console.error("[admin polls] create failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
