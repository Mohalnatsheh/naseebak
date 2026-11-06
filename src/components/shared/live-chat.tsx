"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TAWK_SRC, isLiveChatOffPath, tawkStyle } from "@/lib/live-chat";

interface TawkApi {
  customStyle?: ReturnType<typeof tawkStyle>;
  onLoad?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
}

type TawkWindow = { Tawk_API?: TawkApi; Tawk_LoadStart?: Date };

/** Set on <body> while a modal menu or popup (Sheet, Dialog) is open */
const SCROLL_LOCK = "data-scroll-locked";

/** Hidden on some pages and while a menu or popup is open: Tawk sits above everything, so it would cover their buttons */
function syncBubble() {
  const api = (window as unknown as TawkWindow).Tawk_API;
  if (isLiveChatOffPath(window.location.pathname) || document.body.hasAttribute(SCROLL_LOCK)) api?.hideWidget?.();
  else api?.showWidget?.();
}

/**
 * Tawk.to bubble. Loads on the first page that may show it, once: it can't be unloaded, so a client-side move to a
 * page without it hides the bubble. The member's identity is never passed to Tawk.
 */
export function LiveChat() {
  const pathname = usePathname();

  useEffect(() => {
    const w = window as unknown as TawkWindow;
    if (w.Tawk_API) {
      syncBubble();
      return;
    }
    if (isLiveChatOffPath(pathname)) return;
    w.Tawk_API = { customStyle: tawkStyle(window.innerWidth), onLoad: syncBubble };
    w.Tawk_LoadStart = new Date();
    const script = document.createElement("script");
    script.async = true;
    script.src = TAWK_SRC;
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");
    document.body.appendChild(script);
  }, [pathname]);

  useEffect(() => {
    const observer = new MutationObserver(syncBubble);
    observer.observe(document.body, { attributes: true, attributeFilter: [SCROLL_LOCK] });
    return () => observer.disconnect();
  }, []);

  return null;
}
