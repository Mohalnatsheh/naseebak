import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { COUNTRY_COOKIE } from "@/lib/countries";
import { COUNTRY_COOKIE_OPTIONS, countryQueryRedirect } from "@/lib/visitor-country";

const { auth } = NextAuth(authConfig);

/**
 * Route protection (authConfig.authorized) + the visitor's country from `?country=sa|jo`
 * (stored in the cookie, then the same URL without the parameter).
 * When `authorized` answers with a redirect, NextAuth returns it without calling this handler.
 */
export default auth(async (req) => {
  const switched = countryQueryRedirect(req.nextUrl);
  if (switched) {
    const res = NextResponse.redirect(switched.url);
    res.cookies.set(COUNTRY_COOKIE, switched.country, COUNTRY_COOKIE_OPTIONS);
    return res;
  }
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
