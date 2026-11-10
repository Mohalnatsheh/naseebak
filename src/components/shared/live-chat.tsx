"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TAWK_SRC, bubbleMisplaced, isLiveChatHidden, tawkStyle } from "@/lib/live-chat";

interface TawkApi {
  customStyle?: ReturnType<typeof tawkStyle>;
  onLoad?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
}

type TawkWindow = { Tawk_API?: TawkApi; Tawk_LoadStart?: Date; naseebTawkWidth?: number };

/** Set on <body> while a modal menu or popup (Sheet, Dialog) is open */
const SCROLL_LOCK = "data-scroll-locked";

/** Hidden on some pages and while a menu or popup is open: Tawk sits above everything, so it would cover their buttons */
function syncBubble() {
  const w = window as unknown as TawkWindow;
  const api = w.Tawk_API;
  if (
    isLiveChatHidden(window.location.pathname, window.innerWidth) ||
    document.body.hasAttribute(SCROLL_LOCK) ||
    bubbleMisplaced(w.naseebTawkWidth ?? window.innerWidth, window.innerWidth)
  )
    api?.hideWidget?.();
  else api?.showWidget?.();
}

/** Runs `fn` once the page has loaded and the browser is idle (a timer where requestIdleCallback is missing) */
function whenIdleAfterLoad(fn: () => void) {
  const idle = () => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
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
    if (isLiveChatHidden(pathname, window.innerWidth)) return;
    w.naseebTawkWidth = window.innerWidth;
    w.Tawk_API = { customStyle: tawkStyle(window.innerWidth), onLoad: syncBubble };
    // Added when the browser is idle after the page has loaded (QA PA-L11), not on mount
    const add = () => {
      if (document.querySelector(`script[src="${TAWK_SRC}"]`)) return;
      w.Tawk_LoadStart = new Date();
      const script = document.createElement("script");
      script.async = true;
      script.src = TAWK_SRC;
      script.charset = "UTF-8";
      script.setAttribute("crossorigin", "*");
      document.body.appendChild(script);
    };
    whenIdleAfterLoad(add);
  }, [pathname]);

  useEffect(() => {
    const observer = new MutationObserver(syncBubble);
    observer.observe(document.body, { attributes: true, attributeFilter: [SCROLL_LOCK] });
    // Narrowing a desktop window: the bubble placed for desktop would cover the phone layout's bottom bar
    window.addEventListener("resize", syncBubble);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBubble);
    };
  }, []);

  return null;
}
