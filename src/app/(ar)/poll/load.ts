import { notFound } from "next/navigation";
import { findMyVote, getActivePoll, getPublishedPoll, pollsEnabled, publicView } from "@/lib/engagement/polls";
import { resolveVoter } from "@/lib/engagement/voter";
import type { PollSource } from "@/lib/engagement/poll-types";

/** Server data for /poll and /poll/<slug>; 404 while the switch is off or for an unknown/draft slug */
export async function loadPollPage(slug: string | null, utmSource: string | string[] | undefined) {
  if (!(await pollsEnabled())) notFound();
  const row = slug ? await getPublishedPoll(slug.slice(0, 40)) : await getActivePoll();
  if (slug && !row) notFound();
  const voter = await resolveVoter();
  const member = voter.kind === "member";
  const myVote = !row
    ? null
    : voter.kind === "member"
      ? await findMyVote(row.id, { userId: voter.userId })
      : voter.kind === "visitor"
        ? await findMyVote(row.id, { visitorKey: voter.visitorKey })
        : null;
  const source: PollSource = utmSource === "instagram" ? "instagram" : "page";
  // The public page never mentions credits (owner rule for public copy): no offer here
  return { poll: row ? await publicView(row, myVote) : null, member, source };
}
