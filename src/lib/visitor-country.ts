/**
 * The visitor's country choice on public pages (db-free, safe in client components and the proxy).
 * Set by the navbar flag switcher, or by `?country=sa|jo|lb` on any page (ad links): the proxy stores
 * the cookie and redirects to the same URL without the parameter.
 */
import { COUNTRY_COOKIE, isCountryCode, type CountryCode } from "@/lib/countries";

/** One year */
export const COUNTRY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const COUNTRY_QUERY_PARAM = "country";

/**
 * `?country=sa` → the country and the same URL without the parameter; null when the parameter is
 * missing or not a served country (an unknown value is left alone, like any other parameter).
 */
export function countryQueryRedirect(url: URL): { country: CountryCode; url: URL } | null {
  const raw = url.searchParams.get(COUNTRY_QUERY_PARAM);
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  if (!isCountryCode(code)) return null;
  const clean = new URL(url.href);
  clean.searchParams.delete(COUNTRY_QUERY_PARAM);
  return { country: code, url: clean };
}

/** Cookie options shared by the proxy and the switcher */
export const COUNTRY_COOKIE_OPTIONS = { path: "/", maxAge: COUNTRY_COOKIE_MAX_AGE, sameSite: "lax" as const };

/** `document.cookie` string that stores the choice (client side, the flag switcher) */
export function countryCookieString(code: CountryCode, secure = false): string {
  return `${COUNTRY_COOKIE}=${code}; Path=/; Max-Age=${COUNTRY_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Client side: remember the visitor's choice for a year */
export function rememberVisitorCountry(code: CountryCode) {
  try {
    document.cookie = countryCookieString(code, window.location.protocol === "https:");
  } catch {
    // cookies blocked: the page keeps the country it was rendered with
  }
}
