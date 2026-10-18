"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import TrackingScripts from "@/components/shared/tracking-scripts";
import { GA_MEASUREMENT_ID, isPrivatePath } from "@/lib/analytics";

/**
 * GA4 + GTM + Meta Pixel, on public pages only (`isPrivatePath`). A visit that starts in the
 * dashboard or a chat loads none of them. Scripts can't be unloaded after a client-side move from a
 * public page into the dashboard, so GA is switched off there with its official opt-out flag
 * (`ga-disable-<id>`) and the Pixel's automatic page views on navigation are disabled.
 */
export default function PublicTracking() {
  const pathname = usePathname();
  const isPrivate = isPrivatePath(pathname);
  // Once loaded on a public page the scripts stay (they can't be unloaded)
  const [loaded, setLoaded] = useState(!isPrivate);
  if (!isPrivate && !loaded) setLoaded(true);

  useEffect(() => {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = isPrivate;
  }, [isPrivate]);

  if (!loaded) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window["ga-disable-${GA_MEASUREMENT_ID}"] = /^\\/(dashboard|chat|chats|admin)(\\/|$)/.test(location.pathname);
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag("js", new Date());
gtag("config", "${GA_MEASUREMENT_ID}");`}
      </Script>
      <TrackingScripts />
    </>
  );
}
