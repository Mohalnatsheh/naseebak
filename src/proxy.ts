import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { COUNTRY_COOKIE, type CountryCode } from "@/lib/countries";
import { COUNTRY_COOKIE_OPTIONS, countryQueryRedirect } from "@/lib/visitor-country";
import { SITE_COUNTRY_HEADER, isLocalizedPath, localizedPath, splitCountryPath, switchCountryPath } from "@/lib/site-paths";

const { auth } = NextAuth(authConfig);

/**
 * Render the page for `country`: the page reads the country from SITE_COUNTRY_HEADER. /sa/... reaches its page through
 * next.config.ts, never a rewrite here: behind Nginx that one carries the public host, so Next fetches the public site
 * (`/` without this header, Jordan).
 */
function renderFor(req: NextRequest, country: CountryCode) {
  const headers = new Headers(req.headers);
  headers.set(SITE_COUNTRY_HEADER, country);
  return NextResponse.next({ request: { headers } });
}

function redirectWithCountry(url: URL, country: CountryCode) {
  const res = NextResponse.redirect(url);
  res.cookies.set(COUNTRY_COOKIE, country, COUNTRY_COOKIE_OPTIONS);
  return res;
}

/**
 * 1. Country URLs (SEO, src/lib/site-paths.ts): Jordan at the root, Saudi Arabia under /sa.
 *    `/sa/faq` is rendered as `/faq` for Saudi Arabia (and remembers the choice); `/sa/register` and
 *    other shared pages redirect to the plain URL with the choice stored.
 * 2. `?country=sa|jo` (ad links): a localized page redirects to that country's URL; any other page
 *    stores the choice and drops the parameter.
 * 3. Route protection (authConfig.authorized). When `authorized` answers with a redirect, NextAuth
 *    returns it without calling this handler.
 */
export default auth(async (req) => {
  const { country: urlCountry, path } = splitCountryPath(req.nextUrl.pathname);

  const switched = countryQueryRedirect(req.nextUrl);
  if (switched) {
    // A post or question belongs to one country: the other country gets its list
    if (isLocalizedPath(path)) {
      const same = switched.country === (urlCountry ?? "JO");
      switched.url.pathname = (same ? localizedPath(path, switched.country) : switchCountryPath(path, switched.country)) ?? path;
    }
    return redirectWithCountry(switched.url, switched.country);
  }

  if (urlCountry) {
    if (isLocalizedPath(path)) {
      const res = renderFor(req, urlCountry);
      if (req.cookies.get(COUNTRY_COOKIE)?.value !== urlCountry) res.cookies.set(COUNTRY_COOKIE, urlCountry, COUNTRY_COOKIE_OPTIONS);
      return res;
    }
    const plain = req.nextUrl.clone();
    plain.pathname = path;
    return redirectWithCountry(plain, urlCountry);
  }

  // Jordan's localized pages (always public): the URL decides the country, not the cookie
  if (isLocalizedPath(path)) return renderFor(req, "JO");

  // With a handler, NextAuth skips its own "not authorized → sign-in page" redirect: same rule here
  const allowed = await authConfig.callbacks.authorized({ auth: req.auth, request: req });
  if (allowed instanceof Response) return allowed;
  if (!allowed && req.nextUrl.pathname !== authConfig.pages.signIn) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = authConfig.pages.signIn;
    signInUrl.search = "";
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
