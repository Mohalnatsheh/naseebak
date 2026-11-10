/**
 * Country URLs for SEO (db-free; proxy, server and client).
 * Jordan keeps the root (`/`, `/faq`, …) so existing rankings and links stay; Saudi Arabia lives under
 * `/sa` (`/sa`, `/sa/faq`, …), Lebanon under `/lb`. next.config.ts rewrites `/sa/...` and `/lb/...` to the same page and the
 * proxy tells it the country through the SITE_COUNTRY_HEADER request header. Every localized page declares the open
 * countries' versions to search engines (hreflang ar-JO / ar-SA / ar-LB, x-default = Jordan) and its own canonical URL.
 * The blog and «سؤال نصيبك» have one too, with their own content per country (`/blog/...`, `/sa/blog/...`,
 * `/poll/...`, `/sa/poll/...`, `/lb/poll/...`).
 * Pages that follow the account or are shared (dashboard, login, register) have no country URL.
 */
import { COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from "@/lib/countries";
import { COUNTRY_PREFIX as PREFIX, LOCALIZED_PATHS } from "@/lib/site-path-list";

export { LOCALIZED_PATHS };

export const SITE_URL = "https://naseebak.com";

/** Request header the proxy sets on localized pages: the country the URL belongs to */
export const SITE_COUNTRY_HEADER = "x-site-country";

/** hreflang of each country's pages */
export const HREFLANG: Record<CountryCode, string> = { JO: "ar-JO", SA: "ar-SA", LB: "ar-LB" };

export function isLocalizedPath(path: string): boolean {
  return (LOCALIZED_PATHS as readonly string[]).includes(path === "" ? "/" : path) || path.startsWith("/blog/") || path.startsWith("/poll/");
}

/**
 * `/sa/faq` → { country: "SA", path: "/faq" }; `/faq` → { country: null, path: "/faq" }.
 * Only the exact segment counts (`/sales` is not Saudi, `/lbx` is not Lebanese).
 */
export function splitCountryPath(pathname: string): { country: CountryCode | null; path: string } {
  for (const c of COUNTRY_CODES) {
    const p = PREFIX[c];
    if (!p) continue;
    if (pathname === p) return { country: c, path: "/" };
    if (pathname.startsWith(`${p}/`)) return { country: c, path: pathname.slice(p.length) || "/" };
  }
  return { country: null, path: pathname };
}

/**
 * A link for a country: localized pages get the country prefix ("/faq" → "/sa/faq", "/" → "/sa",
 * "/#how" → "/sa#how", "/faq?x=1" → "/sa/faq?x=1"); everything else is returned as is.
 */
export function localizedPath(href: string, country: CountryCode): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const m = href.match(/^([^?#]*)(.*)$/);
  const path = m?.[1] || "/";
  const rest = m?.[2] ?? "";
  const { path: bare } = splitCountryPath(path);
  if (!isLocalizedPath(bare)) return href;
  const prefix = PREFIX[country];
  if (!prefix) return `${bare}${rest}`;
  return bare === "/" ? `${prefix}${rest}` : `${prefix}${bare}${rest}`;
}

/** The same page in another country (switcher), or null when the page has no country version */
export function switchCountryPath(pathname: string, to: CountryCode): string | null {
  const { path } = splitCountryPath(pathname);
  // A post or question belongs to one country: the other country gets its list or current question
  if (path.startsWith("/blog/")) return localizedPath("/blog", to);
  if (path.startsWith("/poll/")) return localizedPath("/poll", to);
  return isLocalizedPath(path) ? localizedPath(path, to) : null;
}

/** Absolute URL of a localized page in a country */
export function absoluteUrl(path: string, country: CountryCode): string {
  const p = localizedPath(path, country);
  return p === "/" ? SITE_URL : `${SITE_URL}${p}`;
}

/**
 * Metadata `alternates` for a localized page: its own canonical + every open country's version + x-default.
 * `countries` = the countries switched on in Admin → Countries (`activeCountryCodes()`), required: a closed country's
 * URLs are never advertised.
 */
export function seoAlternates(path: string, country: CountryCode, countries: readonly CountryCode[]) {
  const languages: Record<string, string> = {};
  for (const c of countries) languages[HREFLANG[c]] = absoluteUrl(path, c);
  languages["x-default"] = absoluteUrl(path, DEFAULT_COUNTRY);
  return { canonical: absoluteUrl(path, country), languages };
}
