import { NextResponse } from "next/server";
import { findMyVote, getActivePoll, getPublishedPoll, pollRewardCredits, pollsEnabled, publicView } from "@/lib/engagement/polls";
import { resolveVoter } from "@/lib/engagement/voter";
import { getVisitorCountry } from "@/lib/countries/server";
import { getCountrySettings } from "@/lib/countries/settings";

/**
 * «سؤال نصيبك» for this voter: `?slug=` for a given one (active or closed), else the active one, of a member's
 * own country (the website and the app alike) or the visitor's.
 * `{ poll: null }` when the switch is off or nothing is running.
 */
export async function GET(request: Request) {
  try {
    if (!(await pollsEnabled())) return NextResponse.json({ poll: null });
    const slug = new URL(request.url).searchParams.get("slug");
    const voter = await resolveVoter();
    if (voter.kind === "member" && voter.pollsOff) return NextResponse.json({ poll: null });
    const country = voter.kind === "member" ? voter.country : await getVisitorCountry();
    if (!(await getCountrySettings(country)).pollsEnabled) return NextResponse.json({ poll: null });
    const poll = slug ? await getPublishedPoll(slug.slice(0, 40), country) : await getActivePoll(country);
    if (!poll) return NextResponse.json({ poll: null });
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
