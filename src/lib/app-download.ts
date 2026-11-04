/**
 * «Get the app» for Android visitors of the website (AppDownloadBanner, /dashboard/install).
 * Pure helpers so they can be tested; the store link itself comes from Admin → Settings → «Mobile app».
 */

/** Cookie set when the banner is closed: the server skips it until the cookie expires */
export const APP_BANNER_COOKIE = "naseeb_app_banner_hidden";
export const APP_BANNER_HIDE_DAYS = 7;

export function isAndroidUserAgent(ua: string | null | undefined): boolean {
  return !!ua && /android/i.test(ua);
}

/** Inside Instagram / Facebook / TikTok… on Android: a plain Play link would open Play's web page in that app */
function isInAppBrowser(ua: string): boolean {
  return /instagram|FBAN|FBAV|FB_IAB|musical_ly|BytedanceWebview|TikTok|snapchat|; wv\)|Line\//i.test(ua);
}

/**
 * Link that opens the Play Store app on the Naseebak page, tagged with where the tap came from
 * (Play Console → Statistics → acquisition by UTM). Chrome hands play.google.com links to the Play app
 * by itself; in-app browsers get an intent with the web page as fallback. A store link that isn't a
 * Play listing (set by the admin) is returned unchanged.
 */
export function playStoreHref(storeUrl: string, place: string, ua: string): string {
  let url: URL;
  try {
    url = new URL(storeUrl);
  } catch {
    return storeUrl;
  }
  const id = url.searchParams.get("id");
  if (url.hostname !== "play.google.com" || !id) return storeUrl;
  url.searchParams.set("referrer", `utm_source=naseebak_web&utm_medium=${place}`);
  if (!isInAppBrowser(ua)) return url.href;
  const fallback = encodeURIComponent(url.href);
  return `intent://details?id=${encodeURIComponent(id)}&referrer=${encodeURIComponent(url.searchParams.get("referrer")!)}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${fallback};end`;
}
