import { describe, it, expect } from "vitest";
import { detectDevice, openInBrowserUrl, pushStage } from "@/lib/install-env";

const IOS_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IOS_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36";
const ANDROID_FB = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0]";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("detectDevice", () => {
  it("tells iPhone Safari, Chrome and in-app browsers apart", () => {
    expect(detectDevice(IOS_SAFARI)).toMatchObject({ os: "ios", browser: "safari", inApp: null });
    expect(detectDevice(IOS_CHROME)).toMatchObject({ os: "ios", browser: "chrome", inApp: null });
    expect(detectDevice(IOS_INSTAGRAM)).toMatchObject({ os: "ios", inApp: "instagram" });
  });

  it("tells Android Chrome, Samsung Internet and Facebook's browser apart", () => {
    expect(detectDevice(ANDROID_CHROME)).toMatchObject({ os: "android", browser: "chrome", inApp: null });
    expect(detectDevice(ANDROID_SAMSUNG)).toMatchObject({ os: "android", browser: "samsung", inApp: null });
    expect(detectDevice(ANDROID_FB)).toMatchObject({ os: "android", inApp: "facebook" });
  });

  it("treats an iPad reporting as a Mac with touch as iOS, and keeps standalone", () => {
    expect(detectDevice(IPAD_AS_MAC, { touchMac: true }).os).toBe("ios");
    expect(detectDevice(IPAD_AS_MAC).os).toBe("desktop");
    expect(detectDevice(IOS_SAFARI, { standalone: true }).standalone).toBe(true);
  });
});

describe("pushStage", () => {
  const ios = detectDevice(IOS_SAFARI);
  const iosApp = detectDevice(IOS_SAFARI, { standalone: true });
  it("sends in-app browsers out first, even when they report a permission", () => {
    expect(pushStage(detectDevice(IOS_INSTAGRAM), "unsupported")).toBe("browser");
    expect(pushStage(detectDevice(ANDROID_FB), "default")).toBe("browser");
  });
  it("asks iPhone Safari / Chrome to install, other iPhone browsers to open Safari", () => {
    expect(pushStage(ios, "unsupported")).toBe("install");
    expect(pushStage(detectDevice(IOS_CHROME), "unsupported")).toBe("install");
    expect(pushStage(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) FxiOS/130.0 Mobile/15E148"), "unsupported")).toBe("browser");
  });
  it("then allow, blocked, done", () => {
    expect(pushStage(iosApp, "default")).toBe("allow");
    expect(pushStage(detectDevice(ANDROID_CHROME), "default")).toBe("allow");
    expect(pushStage(iosApp, "denied")).toBe("blocked");
    expect(pushStage(iosApp, "granted")).toBe("done");
    expect(pushStage(detectDevice(ANDROID_CHROME), "unsupported")).toBe("none");
  });
});

describe("openInBrowserUrl", () => {
  const url = "https://naseebak.com/dashboard/install?from=instagram";
  it("opens Chrome on Android with the page as fallback", () => {
    expect(openInBrowserUrl(detectDevice(ANDROID_FB), url)).toBe(
      "intent://naseebak.com/dashboard/install?from=instagram#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fnaseebak.com%2Fdashboard%2Finstall%3Ffrom%3Dinstagram;end"
    );
  });
  it("opens Safari on iPhone, nothing on desktop", () => {
    expect(openInBrowserUrl(detectDevice(IOS_INSTAGRAM), url)).toBe("x-safari-https://naseebak.com/dashboard/install?from=instagram");
    expect(openInBrowserUrl(detectDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0"), url)).toBeNull();
  });
});
