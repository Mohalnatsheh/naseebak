"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import TrackingScripts from "@/components/shared/tracking-scripts";
import { GA_MEASUREMENT_ID, analyticsPageLocation, isAnalyticsOffPath, isPrivatePath } from "@/lib/analytics";

/** gtag stub + config, once: calls queue in dataLayer until gtag.js (loaded below) runs them in order */
function initGtag() {
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  if (w.gtag) return;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // gtag.js needs the arguments object itself, not an array
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

/**
 * GA4 on public pages and the member dashboard; GTM + Meta Pixel on public pages only (`isPrivatePath`).
 * GA's own page views are off (`send_page_view: false`): one is sent per route change with the URL cleaned by
 * `analyticsPageLocation()` (no chat/match ids, no query but `tab`), and `page_location` is set so custom
 * events carry the cleaned URL too. Admin pages get nothing (`isAnalyticsOffPath`, via `ga-disable-<id>`).
 * GTM/Pixel can't be unloaded after a client-side move into the dashboard, so the Pixel's automatic page views
 * on navigation are disabled (tracking-scripts.tsx).
 */
export default function PublicTracking() {
  const pathname = usePathname();
  // GTM/Pixel load only once a public page was shown; GA loads everywhere but admin
  const [publicSeen, setPublicSeen] = useState(!isPrivatePath(pathname));
  if (!isPrivatePath(pathname) && !publicSeen) setPublicSeen(true);
  const previous = useRef<string>("");

  useEffect(() => {
    const off = isAnalyticsOffPath(pathname);
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = off;
    if (off) return;
    const location = analyticsPageLocation(window.location.href);
    const referrer = previous.current || analyticsPageLocation(document.referrer);
    previous.current = location;
    initGtag();
    window.gtag?.("set", { page_location: location, page_referrer: referrer } as never);
    window.gtag?.("event", "page_view", { page_location: location, page_referrer: referrer, page_title: document.title });
  }, [pathname]);

  if (isAnalyticsOffPath(pathname)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      {publicSeen && <TrackingScripts />}
    </>
  );
}
