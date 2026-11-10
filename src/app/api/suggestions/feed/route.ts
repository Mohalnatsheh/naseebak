import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parsePagination } from "@/lib/utils";
import { getSuggestionFeed, type FeedTab } from "@/lib/suggestions/feed";
import { autoSuggestWithReason, type SuggestEmptyReason } from "@/lib/matching/auto-suggest";
import { touchLastActive } from "@/lib/activity";
import { recordActivityDay } from "@/lib/activity-days";

/**
 * Three-tab feed of the simultaneous suggestions flow: ?tab=new|interested|waiting&page=n
 *
 * `topup=1` (additive, QA WM-07): the page-open top-up the website used to get from a separate GET /api/suggestions
 * first. It marks the member active, tops up their suggestions, then reads the feed — one round instead of two — and
 * adds `emptyReason` / `nextSuggestionsAt` (only for «جديدة» with nothing in it, as /api/suggestions does). Old app
 * builds never send it and are unchanged.
 */
export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const userId = result.session.user.id;
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams, 10);
    const wanted = searchParams.get("tab");
    const tab: FeedTab = wanted === "waiting" || wanted === "interested" ? wanted : "new";
    // count=1: only the totals (the page shows the other two tabs' numbers), no cards built
    const countOnly = searchParams.get("count") === "1";

    let emptyReason: SuggestEmptyReason | null = null;
    let nextSuggestionsAt: string | null = null;
    const topUp = searchParams.get("topup") === "1";
    if (topUp) {
      await touchLastActive(userId);
      await recordActivityDay(userId);
      try {
        const run = await autoSuggestWithReason(userId);
        emptyReason = run.reason;
        nextSuggestionsAt = run.nextSuggestionsAt?.toISOString() ?? null;
      } catch (err) {
        console.error("Auto-suggest error:", err);
      }
    }

    const feed = await getSuggestionFeed(userId, tab, page, pageSize, { countOnly });
    if (!topUp) return NextResponse.json(feed);
    // Why nothing new came, only when «جديدة» is empty (never "no_candidates" next to open cards)
    const emptyNew = tab === "new" && feed.total === 0;
    return NextResponse.json({ ...feed, emptyReason: emptyNew ? emptyReason : null, nextSuggestionsAt: emptyNew ? nextSuggestionsAt : null });
  } catch (error) {
    console.error("Suggestion feed error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
