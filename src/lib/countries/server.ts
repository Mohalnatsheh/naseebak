/** Server-only country helpers: the visitor's country (public pages) and the admin's selected country. */
import { cookies, headers } from "next/headers";
import { ADMIN_COUNTRY_COOKIE, COUNTRY_COOKIE, DEFAULT_COUNTRY, isCountryCode, type CountryCode } from "@/lib/countries";

/**
 * Visitor's country: the switcher cookie, else a geo header if the proxy / CDN adds one
 * (Cloudflare `cf-ipcountry`, or `x-country-code` that Nginx GeoIP can set), else Jordan.
 */
export async function getVisitorCountry(): Promise<CountryCode> {
  const jar = await cookies();
  const chosen = jar.get(COUNTRY_COOKIE)?.value?.toUpperCase();
  if (isCountryCode(chosen)) return chosen;
  const h = await headers();
  const geo = (h.get("cf-ipcountry") || h.get("x-country-code") || "").toUpperCase();
  return isCountryCode(geo) ? geo : DEFAULT_COUNTRY;
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
