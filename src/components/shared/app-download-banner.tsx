"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { APP_BANNER_COOKIE, APP_BANNER_HIDE_DAYS } from "@/lib/app-download";
import { trackEvent } from "@/lib/analytics";

/**
 * Slim «تطبيق نصيبك» bar at the top of every page for Android visitors (the server decides from the
 * user agent and the hide cookie, so it never flashes in). Closing hides it for a week. Not on the
 * full-screen chat or the install page, which has its own Play button.
 *
 * The bar sits in the page flow and scrolls away, but the site header and the dashboard's mobile top
 * bar are `fixed top-0`. While the bar shows it publishes how far it reaches down the screen as
 * `--app-banner-offset` on <html>, and those fixed bars sit below it (`top-[var(--app-banner-offset,0px)]`),
 * so it never covers the menu button or «تسجيل الدخول».
 */
const OFFSET_VAR = "--app-banner-offset";

export function AppDownloadBanner({ href }: { href: string }) {
  const pathname = usePathname() || "/";
  const [hidden, setHidden] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const excluded = pathname.startsWith("/dashboard/chats/") || pathname.startsWith("/dashboard/install") || pathname.startsWith("/payments/return") || pathname.startsWith("/pay/");
  const shown = !hidden && !excluded;

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (!shown || !bar) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty(OFFSET_VAR, `${Math.max(0, Math.round(bar.getBoundingClientRect().bottom))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      root.style.removeProperty(OFFSET_VAR);
    };
  }, [shown]);

  // Not on the app's own payment return page either: whoever lands there already has the app
  if (!shown) return null;

  function close() {
    document.cookie = `${APP_BANNER_COOKIE}=1; path=/; max-age=${APP_BANNER_HIDE_DAYS * 24 * 60 * 60}; samesite=lax; secure`;
    trackEvent("app_banner_closed");
    setHidden(true);
  }

  return (
    <div ref={barRef} role="region" aria-label="تطبيق نصيبك" className="relative z-40 border-b border-border/70 bg-card" dir="rtl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="إخفاء"
          className="-ms-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static icon, no optimisation needed */}
        <img src="/images/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold text-foreground">تطبيق نصيبك</p>
          <p className="truncate text-xs text-muted-foreground">مجاني على Google Play</p>
        </div>
        <a
          href={href}
          onClick={() => trackEvent("app_download_click", { place: "banner" })}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          تحميل
        </a>
      </div>
    </div>
  );
}
