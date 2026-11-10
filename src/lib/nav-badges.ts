/**
 * The dashboard nav badges (sidebar and bottom bar), keyed by each link's own page — never by the href it is rewritten
 * to: with shared suggestions «التوافقات» opens `/dashboard/suggestions?tab=matches`, and must still carry the requests
 * to answer, not the suggestions page's count (review X4a, Important 1).
 *
 * Colours (design review P2-4 / DS-16): red only for "act now" (a family or chat request), gold for good news (someone
 * said «مهتم»), navy for plain counts (new suggestions, unread). Db-free.
 */
export type BadgeTone = "urgent" | "count" | "news";

export interface NavBadge {
  n: number;
  tone: BadgeTone;
}

export interface NavBadgeInput {
  unreadNotifications: number;
  unreadChats: number;
  pendingIntros: number;
  /** Shared suggestions on: the «مهتمون بك» and «جديدة» counts mean something */
  mutualSuggestions: boolean;
  likedYou?: number;
  newSuggestions?: number;
}

/** Badge per main link, keyed by the link's original href (`/dashboard/matches` for «التوافقات») */
export function navBadges(i: NavBadgeInput): Record<string, NavBadge> {
  const liked = i.mutualSuggestions ? i.likedYou ?? 0 : 0;
  const fresh = i.mutualSuggestions ? i.newSuggestions ?? 0 : 0;
  return {
    "/dashboard/notifications": { n: i.unreadNotifications, tone: "count" },
    // Someone already said «مهتم» (good news) wins; else how many new cards wait
    "/dashboard/suggestions": liked > 0 ? { n: liked, tone: "news" } : { n: fresh, tone: "count" },
    // A family or chat request to answer: act now
    "/dashboard/matches": { n: i.pendingIntros, tone: "urgent" },
    "/dashboard/chats": { n: i.unreadChats, tone: "count" },
  };
}
