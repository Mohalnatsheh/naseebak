import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { clientIp } from "@/lib/rate-limit";
import { rateLimitDb } from "@/lib/rate-limit-db";
import { PollError, TEST_SOURCE, castVote, pollRewardCredits, pollsEnabled, publicView } from "@/lib/engagement/polls";
import { resolveVoter } from "@/lib/engagement/voter";

const bodySchema = z.object({
  pollId: z.string().min(1).max(40),
  optionId: z.string().min(1).max(20),
  source: z.enum(["dashboard", "page", "instagram"]).default("page"),
});

const ERRORS: Record<PollError["code"], [string, number]> = {
  NOT_FOUND: ["هذا السؤال غير متاح", 404],
  CLOSED: ["انتهى التصويت على هذا السؤال", 409],
  BAD_OPTION: ["اختر إجابة من الخيارات", 400],
};

/** One vote per member or browser; a repeat returns the first vote with the results. A member's first answer earns the reward */
export async function POST(request: Request) {
  try {
    if (!(await pollsEnabled())) return NextResponse.json({ error: ERRORS.NOT_FOUND[0] }, { status: 404 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: ERRORS.BAD_OPTION[0] }, { status: 400 });

    const limit = await rateLimitDb(`poll:ip:${clientIp(request)}`, { maxAttempts: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.success) return NextResponse.json({ error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { status: 429 });

    const voter = await resolveVoter({ createCookie: true });
    if (voter.kind === "blocked") return NextResponse.json({ error: "حسابك غير مفعّل" }, { status: 403 });
    if (voter.kind === "member" && voter.pollsOff) return NextResponse.json({ error: ERRORS.NOT_FOUND[0] }, { status: 404 });
    const { pollId, optionId } = parsed.data;
    // The dashboard is members only; a visitor can't claim it
    const source = voter.kind === "member" ? parsed.data.source : parsed.data.source === "dashboard" ? "page" : parsed.data.source;

    const result = await castVote(
      voter.kind === "member"
        ? { pollId, optionId, userId: voter.userId, gender: voter.gender, source: voter.test ? TEST_SOURCE : source, reward: await pollRewardCredits(), country: voter.country }
        : { pollId, optionId, visitorKey: voter.visitorKey, source },
    );
    return NextResponse.json({ poll: await publicView(result.poll, result.vote), created: result.created });
  } catch (error) {
    if (error instanceof PollError) {
      const [message, status] = ERRORS[error.code];
      return NextResponse.json({ error: message, code: error.code }, { status });
    }
    console.error("[polls] vote failed:", error);
    return NextResponse.json({ error: "تعذّر تسجيل صوتك. حاول مرة أخرى." }, { status: 500 });
  }
}
