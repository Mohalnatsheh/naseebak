import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parsePagination } from "@/lib/utils";
import { getSuggestionFeed } from "@/lib/suggestions/feed";

/** Two-tab feed of the simultaneous suggestions flow: ?tab=new|waiting&page=n */
export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePagination(searchParams, 10);
    const tab = searchParams.get("tab") === "waiting" ? "waiting" : "new";
    return NextResponse.json(await getSuggestionFeed(result.session.user.id, tab, page, pageSize));
  } catch (error) {
    console.error("Suggestion feed error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
