import { NextResponse } from "next/server";
import { findMyVote, getActivePoll, getPublishedPoll, pollRewardCredits, pollsEnabled, publicView } from "@/lib/engagement/polls";
import { resolveVoter } from "@/lib/engagement/voter";

/**
 * «سؤال نصيبك» for this voter: `?slug=` for a given one (active or closed), else the active one.
 * `{ poll: null }` when the switch is off or nothing is running.
 */
export async function GET(request: Request) {
  try {
    if (!(await pollsEnabled())) return NextResponse.json({ poll: null });
    const slug = new URL(request.url).searchParams.get("slug");
    const poll = slug ? await getPublishedPoll(slug.slice(0, 40)) : await getActivePoll();
    if (!poll) return NextResponse.json({ poll: null });
    const voter = await resolveVoter();
    const myVote =
      voter.kind === "member"
        ? await findMyVote(poll.id, { userId: voter.userId })
        : voter.kind === "visitor"
          ? await findMyVote(poll.id, { visitorKey: voter.visitorKey })
          : null;
    const offer = voter.kind === "member" ? await pollRewardCredits() : 0;
    return NextResponse.json({ poll: await publicView(poll, myVote, offer), member: voter.kind === "member" });
  } catch (error) {
    console.error("[polls] current failed:", error);
    return NextResponse.json({ error: "تعذّر تحميل السؤال" }, { status: 500 });
  }
}
