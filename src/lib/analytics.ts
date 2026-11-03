/**
 * Google Analytics 4 (gtag.js). Loaded in the Arabic user-facing layout: public pages and the member dashboard
 * (admin pages are not tracked). Page views are sent by `PublicTracking` on every route change with
 * `analyticsPageLocation()`, so record ids in dashboard URLs (chats, matches) never reach Google.
 * Custom events below show the user journey in GA → Reports → Engagement → Events.
 * Never send personal data (names, phone numbers, profile answers) in event params.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-39EEZNJBYD";

type GtagParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (command: "event" | "config" | "js" | "set", target: string | Date, params?: GtagParams) => void;
  }
}

export type AnalyticsEvent =
  | "landing_start" // { place: "hero" | "final" | "sticky" } — the landing quick start sent someone to /register
  | "otp_requested" // { context: "login" | "register" }
  | "sign_up" // GA4 recommended: { method: "phone" }
  | "login" // GA4 recommended: { method: "phone" }
  | "profile_completed"
  | "personality_quiz_completed"
  | "photo_uploaded"
  | "verification_submitted"
  | "suggestion_response" // { response: "accept" | "reject" }
  | "interest_response" // { response: "accept" | "reject" }
  | "begin_checkout" // GA4 recommended
  | "payment_success"
  | "poll_vote"; // { source: "page" | "instagram" } — a visitor answered «سؤال نصيبك» on /poll

export function trackEvent(name: AnalyticsEvent, params?: GtagParams) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // Analytics must never break the app
  }
}

/**
 * Signed-in areas: the dashboard, chats and admin. GTM and the Meta Pixel never load there; GA4 runs in the
 * dashboard with cleaned URLs (`analyticsPageLocation`) and never in admin (`isAnalyticsOffPath`).
 */
export function isPrivatePath(pathname: string | null | undefined): boolean {
  return /^\/(dashboard|chat|chats|admin)(\/|$)/.test(pathname ?? "");
}

/** Admin pages: no analytics at all */
export function isAnalyticsOffPath(pathname: string | null | undefined): boolean {
  return /^\/admin(\/|$)/.test(pathname ?? "");
}

/** Query params kept on signed-in pages (which tab is open); everything else (match=<id> …) is dropped */
const PRIVATE_QUERY_KEEP = new Set(["tab"]);

/** A path segment that is a record id (cuid / uuid / long token with digits), not a page name */
function isIdSegment(segment: string): boolean {
  return segment.length >= 16 && /\d/.test(segment) && /^[a-z0-9_-]+$/i.test(segment);
}

/**
 * The URL GA4 gets as page_location / page_referrer. Public pages are unchanged (utm tags stay) but lose `callbackUrl`. On signed-in
 * pages ids become ":id" (`/dashboard/chats/:id`), only `tab` is kept from the query and the hash is dropped.
 * Anything unreadable (another site's referrer stays as is; "" stays "").
 */
export function analyticsPageLocation(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!isPrivatePath(url.pathname)) {
    // login/register keep where the member was going (`callbackUrl=/dashboard/chats/<id>`): drop it, the rest stays
    if (!url.searchParams.has("callbackUrl")) return href;
    url.searchParams.delete("callbackUrl");
    return url.toString();
  }
  const path = url.pathname.split("/").map((seg) => (isIdSegment(seg) ? ":id" : seg)).join("/");
  const query = [...url.searchParams].filter(([k]) => PRIVATE_QUERY_KEEP.has(k));
  const search = query.length ? `?${new URLSearchParams(query)}` : "";
  return `${url.origin}${path}${search}`;
}
