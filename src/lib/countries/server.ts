/** Server-only country helpers: the visitor's country (public pages) and the admin's selected country. */
import { cookies, headers } from "next/headers";
import { ADMIN_COUNTRY_COOKIE, COUNTRY_COOKIE, DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/countries";
import { SITE_COUNTRY_HEADER } from "@/lib/site-paths";
import { activeCountryCodes } from "@/lib/countries/settings";

/**
 * Visitor's country. A localized page (src/lib/site-paths.ts) follows its URL — `/sa/...` = Saudi
 * Arabia, the root = Jordan — through the header the proxy sets. Other pages (login, register, blog):
 * the switcher cookie, else a geo header if the proxy / CDN adds one (Cloudflare `cf-ipcountry`, or
 * `x-country-code` that Nginx GeoIP can set), else Jordan.
 */
export async function getVisitorCountry(): Promise<CountryCode> {
  const active = await activeCountryCodes();
  const ok = (c: string | undefined): c is CountryCode => isCountryCode(c) && active.includes(c);
  const h = await headers();
  const site = h.get(SITE_COUNTRY_HEADER)?.toUpperCase();
  // A country switched off in Admin → Countries is never the visitor's country (its URLs, cookie and geo fall back)
  if (isCountryCode(site)) return ok(site) ? site : DEFAULT_COUNTRY;
  const jar = await cookies();
  const chosen = jar.get(COUNTRY_COOKIE)?.value?.toUpperCase();
  if (ok(chosen)) return chosen;
  return (await getGeoCountry()) ?? DEFAULT_COUNTRY;
}

/** Country from the IP, when the proxy / CDN provides it and that country is active (null otherwise) */
export async function getGeoCountry(): Promise<CountryCode | null> {
  const h = await headers();
  const geo = (h.get("cf-ipcountry") || h.get("x-country-code") || "").toUpperCase();
  return isCountryCode(geo) && (await activeCountryCodes()).includes(geo) ? geo : null;
}

/** Did the visitor choose a country (switcher, /sa link or ?country=)? */
export async function hasCountryChoice(): Promise<boolean> {
  return isCountryCode((await cookies()).get(COUNTRY_COOKIE)?.value?.toUpperCase());
}

export type AdminCountry = CountryCode | "ALL";

/** Country the admin panel is managing (cookie set by the admin selector; Jordan by default) */
export async function getAdminCountry(request?: Request): Promise<AdminCountry> {
  let v: string | undefined;
  if (request) {
    v = (request.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${ADMIN_COUNTRY_COOKIE}=`))?.split("=")[1];
  } else {
    v = (await cookies()).get(ADMIN_COUNTRY_COOKIE)?.value;
  }
  const up = v?.toUpperCase();
  if (up === "ALL") return "ALL";
  return isCountryCode(up) ? up : DEFAULT_COUNTRY;
}

/** Prisma `where` part on a User for the admin's country ({} for ALL) */
export function userCountryWhere(country: AdminCountry): { country?: string } {
  return country === "ALL" ? {} : { country };
}
