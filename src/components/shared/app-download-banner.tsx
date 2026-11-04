"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { APP_BANNER_COOKIE, APP_BANNER_HIDE_DAYS } from "@/lib/app-download";
import { trackEvent } from "@/lib/analytics";

/**
 * Slim «تطبيق نصيبك» bar at the top of every page for Android visitors (the server decides from the
 * user agent and the hide cookie, so it never flashes in). Closing hides it for a week. Not on the
 * full-screen chat or the install page, which has its own Play button.
 */
export function AppDownloadBanner({ href }: { href: string }) {
  const pathname = usePathname() || "/";
  const [hidden, setHidden] = useState(false);
  // Not on the app's own payment return page either: whoever lands there already has the app
  if (hidden || pathname.startsWith("/dashboard/chats/") || pathname.startsWith("/dashboard/install") || pathname.startsWith("/payments/return")) return null;

  function close() {
    document.cookie = `${APP_BANNER_COOKIE}=1; path=/; max-age=${APP_BANNER_HIDE_DAYS * 24 * 60 * 60}; samesite=lax; secure`;
    trackEvent("app_banner_closed");
    setHidden(true);
  }

  return (
    <div role="region" aria-label="تطبيق نصيبك" className="relative z-[70] border-b border-border/70 bg-card" dir="rtl">
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
