/**
 * Two content widths on dashboard pages (design review P1-6 / DS-17): 42rem for forms, the chats list and the account
 * pages; 64rem for home, suggestions (with the matches tab) and payments. The banner slot sits in the same column, so
 * it is never wider than the page under it. A chat room keeps the wide column. Db-free.
 */
export type PageWidth = "narrow" | "wide";

const WIDE = ["/dashboard/suggestions", "/dashboard/matches", "/dashboard/payments", "/dashboard/chats/"];

export function pageWidth(pathname: string): PageWidth {
  if (pathname === "/dashboard") return "wide";
  return WIDE.some((p) => pathname.startsWith(p)) ? "wide" : "narrow";
}

export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
};
