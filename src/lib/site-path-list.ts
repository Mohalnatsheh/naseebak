/**
 * The lists behind country URLs, with no imports that need the `@/` alias, so next.config.ts can read them too:
 * `rewrites()` builds every country's rewrites from these, so /sa and /lb can never drift apart.
 * Everything else about country URLs lives in src/lib/site-paths.ts.
 */
import type { CountryCode } from "./countries";

/** URL prefix per country (Jordan = root) */
export const COUNTRY_PREFIX: Record<CountryCode, string> = {
  JO: "",
  SA: "/sa",
  LB: "/lb",
};

/** Public pages that exist once per country */
export const LOCALIZED_PATHS = ["/", "/faq", "/about", "/contact", "/terms", "/privacy", "/refund-policy", "/blog", "/poll"] as const;

/** Paths with a dynamic part (a blog post, a question) that also exist once per country */
export const LOCALIZED_DYNAMIC_PATHS = ["/blog/:slug", "/poll/:slug"] as const;

/** next.config.ts rewrites: every non-root prefix reaches the same page as the root (the proxy sets the country) */
export function countryRewrites(): { source: string; destination: string }[] {
  const prefixes = Object.values(COUNTRY_PREFIX).filter(Boolean);
  return prefixes.flatMap((prefix) => [
    { source: prefix, destination: "/" },
    ...[...LOCALIZED_PATHS.filter((p) => p !== "/"), ...LOCALIZED_DYNAMIC_PATHS].map((path) => ({ source: `${prefix}${path}`, destination: path })),
  ]);
}
