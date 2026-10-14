/**
 * Google Analytics 4 (gtag.js). Loaded in the Arabic user-facing layout only (admin pages are not tracked).
 * Page views are automatic (GA4 enhanced measurement follows client-side navigation).
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
  | "payment_success";

export function trackEvent(name: AnalyticsEvent, params?: GtagParams) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // Analytics must never break the app
  }
}
