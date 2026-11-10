import { notFound } from "next/navigation";
import { findMyVote, getActivePoll, getPublishedPoll, pollsEnabled, publicView } from "@/lib/engagement/polls";
import { resolveVoter } from "@/lib/engagement/voter";
import { getVisitorCountry } from "@/lib/countries/server";
import { getCountrySettings } from "@/lib/countries/settings";
import type { PollSource } from "@/lib/engagement/poll-types";

/**
 * Server data for /poll and /poll/<slug> (a member's own country, else the URL's). /poll with no question running —
 * polls off, or off in this country — is the page's «no question now» state (QA PA-M5: a 404 there reached the
 * browser as an empty page); /poll/<slug> stays a 404 while off, and for an unknown/draft slug.
 */
export async function loadPollPage(slug: string | null, utmSource: string | string[] | undefined) {
  const source: PollSource = utmSource === "instagram" ? "instagram" : "page";
  const nothing = async () => ({ poll: null, member: (await resolveVoter()).kind === "member", source, pollsOff: true });
  if (!(await pollsEnabled())) return slug ? notFound() : nothing();
  const voter = await resolveVoter();
  const country = voter.kind === "member" ? voter.country : await getVisitorCountry();
  if (!(await getCountrySettings(country)).pollsEnabled) return slug ? notFound() : nothing();
  const row = slug ? await getPublishedPoll(slug.slice(0, 40), country) : await getActivePoll(country);
  if (slug && !row) notFound();
  const member = voter.kind === "member";
  const myVote = !row
    ? null
    : voter.kind === "member"
      ? await findMyVote(row.id, { userId: voter.userId })
      : voter.kind === "visitor"
        ? await findMyVote(row.id, { visitorKey: voter.visitorKey })
        : null;
  // The public page never mentions credits (owner rule for public copy): no offer here
  return { poll: row ? await publicView(row, myVote) : null, member, source, pollsOff: false };
}
