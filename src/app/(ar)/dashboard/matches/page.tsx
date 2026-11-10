import { redirect } from "next/navigation";
import { getCycleFlags } from "@/lib/settings";
import { matchesHref } from "@/lib/matches/links";
import { MatchesView } from "@/components/matches/matches-view";

/**
 * Mutual matches live in the «توافق متبادل» tab of /dashboard/suggestions (owner decision 2026-10-23:
 * every match in one place). This route stays for old links and notifications (`?match=<id>` is kept).
 * The redirect happens on the server (QA PA-M2): it used to wait in the browser for the dashboard counts (9.6 s on
 * a phone). With shared suggestions off, the matches page is shown on its own as before.
 */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ match?: string | string[] }> }) {
  const { mutualSuggestions } = await getCycleFlags();
  if (mutualSuggestions) {
    const raw = (await searchParams).match;
    const match = typeof raw === "string" && raw ? raw : null;
    redirect(matchesHref(true, match));
  }
  return <MatchesView />;
}
