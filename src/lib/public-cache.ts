/**
 * Cache-Control for public, non-personal API answers (QA PA-L6). Set by the route on a successful answer only, so an
 * error is never cached (review X1). These routes are left out of next.config's `private, no-store` default.
 */
export const PUBLIC_SHORT_CACHE = { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };
export const PUBLIC_STATS_CACHE = { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
