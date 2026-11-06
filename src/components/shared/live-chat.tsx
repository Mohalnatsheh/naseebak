"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TAWK_SRC, TAWK_STYLE, isLiveChatOffPath } from "@/lib/live-chat";

interface TawkApi {
  customStyle?: typeof TAWK_STYLE;
  onLoad?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
}

type TawkWindow = { Tawk_API?: TawkApi; Tawk_LoadStart?: Date };

/**
 * Tawk.to bubble. Loads on the first page that may show it, once: it can't be unloaded, so a client-side move to a
 * page without it hides the bubble. The member's identity is never passed to Tawk.
 */
export function LiveChat() {
  const pathname = usePathname();

  useEffect(() => {
    const w = window as unknown as TawkWindow;
    const off = isLiveChatOffPath(pathname);
    if (w.Tawk_API) {
      if (off) w.Tawk_API.hideWidget?.();
      else w.Tawk_API.showWidget?.();
      return;
    }
    if (off) return;
    w.Tawk_API = {
      customStyle: TAWK_STYLE,
      onLoad: () => {
        if (isLiveChatOffPath(window.location.pathname)) w.Tawk_API?.hideWidget?.();
      },
    };
    w.Tawk_LoadStart = new Date();
    const script = document.createElement("script");
    script.async = true;
    script.src = TAWK_SRC;
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");
    document.body.appendChild(script);
  }, [pathname]);

  return null;
}
