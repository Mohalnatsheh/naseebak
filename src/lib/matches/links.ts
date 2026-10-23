/**
 * Where "my mutual matches" lives (browser-safe, no db import): the «توافق متبادل» tab of
 * /dashboard/suggestions when shared suggestions are on, else the old matches page.
 * `/dashboard/matches?match=` keeps working either way (it redirects to the tab).
 */
export function matchesHref(mutualSuggestions: boolean, matchId?: string | null): string {
  const q = matchId ? `match=${encodeURIComponent(matchId)}` : "";
  return mutualSuggestions
    ? `/dashboard/suggestions?tab=matches${q ? `&${q}` : ""}`
    : `/dashboard/matches${q ? `?${q}` : ""}`;
}
