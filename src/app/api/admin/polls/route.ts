import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { nextPollSlug, pollRewardCredits, pollRoundDays, pollsEnabled, rotatePollsIfDue, TEST_SOURCE } from "@/lib/engagement/polls";
import { pollInputSchema } from "@/lib/validations/poll";

/** Every question, newest first, with its counted votes, plus the settings (a due rotation runs first) */
export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    await rotatePollsIfDue().catch((error) => console.error("[admin polls] rotation failed:", error));
    const [polls, counts, enabled, roundDays, rewardCredits, rewarded] = await Promise.all([
      db.poll.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      db.pollVote.groupBy({ by: ["pollId"], where: { source: { not: TEST_SOURCE } }, _count: { _all: true } }),
      pollsEnabled(),
      pollRoundDays(),
      pollRewardCredits(),
      db.pollVote.aggregate({ _sum: { rewardCredits: true } }),
    ]);
    const votes = new Map(counts.map((c) => [c.pollId, c._count._all]));
    return NextResponse.json({
      enabled,
      roundDays,
      rewardCredits,
      creditsGiven: rewarded._sum.rewardCredits ?? 0,
      polls: polls.map((p) => ({ ...p, votes: votes.get(p.id) ?? 0 })),
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
    const { question, options, note } = parsed.data;
    const poll = await db.poll.create({
      data: {
        slug: await nextPollSlug(),
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
