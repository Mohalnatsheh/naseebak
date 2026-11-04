import { describe, expect, it } from "vitest";
import { isAndroidUserAgent, playStoreHref } from "@/lib/app-download";

const PLAY = "https://play.google.com/store/apps/details?id=com.naseebak.naseebakApp";
const CHROME = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const INSTAGRAM = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 Instagram 350.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1";

describe("app download", () => {
  it("shows only on Android", () => {
    expect(isAndroidUserAgent(CHROME)).toBe(true);
    expect(isAndroidUserAgent(IPHONE)).toBe(false);
    expect(isAndroidUserAgent(null)).toBe(false);
  });

  it("Chrome: the Play link with a UTM referrer", () => {
    const href = new URL(playStoreHref(PLAY, "banner", CHROME));
    expect(href.hostname).toBe("play.google.com");
    expect(href.searchParams.get("id")).toBe("com.naseebak.naseebakApp");
    expect(href.searchParams.get("referrer")).toBe("utm_source=naseebak_web&utm_medium=banner");
  });

  it("in-app browser: a Play Store intent with the web page as fallback", () => {
    const href = playStoreHref(PLAY, "banner", INSTAGRAM);
    expect(href.startsWith("intent://details?id=com.naseebak.naseebakApp&referrer=")).toBe(true);
    expect(href).toContain(";scheme=market;package=com.android.vending;");
    expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=")}`);
  });

  it("leaves a non-Play store link alone", () => {
    expect(playStoreHref("https://example.com/app", "banner", CHROME)).toBe("https://example.com/app");
    expect(playStoreHref("not a url", "banner", CHROME)).toBe("not a url");
  });
});
