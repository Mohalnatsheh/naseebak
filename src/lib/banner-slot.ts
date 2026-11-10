/**
 * The one banner slot on dashboard pages (design review P1-5 / DS-05 / DS-06): at most one compact line above the
 * page title, picked by priority. Pure and db-free (shared by the slot component and its tests).
 *
 * Priority: 1 setup not done → 2 0 credits with someone's «مهتم» waiting → 3 a family request waiting →
 * 4 notifications off on this device → 5 the page's own tip.
 *
 * A page that already shows an item in its content "covers" it (home lists setup, requests and likedYou; the
 * suggestions page has its own credit notes). When the top item is covered, the slot stays empty rather than
 * showing a lower one above it: the most important thing is never pushed down by a lesser banner.
 */
export type BannerKind = "setup" | "zeroCredits" | "familyRequest" | "push" | "tip";

export const BANNER_PRIORITY: readonly BannerKind[] = ["setup", "zeroCredits", "familyRequest", "push", "tip"];

/** After «لاحقاً» on the notifications nudge it stays away this long */
export const PUSH_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BannerInput {
  pathname: string;
  setupDone: boolean;
  creditOnInterest: boolean;
  credits: number;
  likedYou: number;
  pendingIntros: number;
  /** Notifications can be turned on for this device (not done, not unsupported) */
  pushNeeded: boolean;
  /** «لاحقاً» was pressed less than PUSH_SNOOZE_MS ago */
  pushSnoozed: boolean;
  /** The page registered a tip that wasn't dismissed */
  tip: boolean;
}

/** Pages with no slot at all: a chat room is full screen, the guide and the setup are the task itself */
export function slotHidden(pathname: string): boolean {
  return (
    /^\/dashboard\/chats\/[^/]+/.test(pathname) ||
    pathname.startsWith("/dashboard/install") ||
    pathname.startsWith("/dashboard/profile/setup") ||
    pathname.startsWith("/dashboard/reactivate")
  );
}

/** What each page already shows in its content */
export function coveredBy(pathname: string): BannerKind[] {
  if (pathname === "/dashboard") return ["setup", "zeroCredits", "familyRequest"];
  if (pathname.startsWith("/dashboard/suggestions")) return ["zeroCredits"];
  if (pathname.startsWith("/dashboard/payments")) return ["zeroCredits"];
  return [];
}

function wants(kind: BannerKind, i: BannerInput): boolean {
  switch (kind) {
    case "setup":
      return !i.setupDone;
    case "zeroCredits":
      return i.creditOnInterest && i.credits <= 0 && i.likedYou > 0;
    case "familyRequest":
      return i.pendingIntros > 0;
    case "push":
      return i.pushNeeded && !i.pushSnoozed;
    case "tip":
      return i.tip;
  }
}

export function pickBanner(i: BannerInput): BannerKind | null {
  if (slotHidden(i.pathname)) return null;
  const top = BANNER_PRIORITY.find((k) => wants(k, i));
  if (!top) return null;
  return coveredBy(i.pathname).includes(top) ? null : top;
}
