/**
 * Where the site is running, for the install / notification guides. `detectDevice` is pure (UA in,
 * answer out) so it can be tested; `currentDevice` reads the real browser.
 */
export type InAppBrowser = "instagram" | "facebook" | "tiktok" | "snapchat" | "other";
export type DeviceBrowser = "safari" | "chrome" | "samsung" | "firefox" | "other";

export interface Device {
  os: "ios" | "android" | "desktop";
  browser: DeviceBrowser;
  /** Inside another app's built-in browser: can't install or get notifications there */
  inApp: InAppBrowser | null;
  /** Opened from the home-screen icon */
  standalone: boolean;
}

export function detectDevice(ua: string, opts: { touchMac?: boolean; standalone?: boolean } = {}): Device {
  // iPadOS reports itself as a Mac with touch
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && !!opts.touchMac);
  const android = /android/i.test(ua);
  const inApp: InAppBrowser | null = /instagram/i.test(ua)
    ? "instagram"
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)
      ? "facebook"
      : /musical_ly|BytedanceWebview|TikTok/i.test(ua)
        ? "tiktok"
        : /snapchat/i.test(ua)
          ? "snapchat"
          : /; wv\)|Line\//i.test(ua)
            ? "other"
            : null;
  const browser: DeviceBrowser = /SamsungBrowser/i.test(ua)
    ? "samsung"
    : /FxiOS|Firefox/i.test(ua)
      ? "firefox"
      : /CriOS|Chrome/i.test(ua)
        ? "chrome"
        : ios && /Safari/i.test(ua)
          ? "safari"
          : "other";
  return { os: ios ? "ios" : android ? "android" : "desktop", browser, inApp, standalone: !!opts.standalone };
}

export function currentDevice(): Device {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return detectDevice(navigator.userAgent, { touchMac: navigator.maxTouchPoints > 1, standalone });
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

/** "unsupported" on iPhone until the site is opened from the home-screen icon */
export function pushPermission(): PushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
