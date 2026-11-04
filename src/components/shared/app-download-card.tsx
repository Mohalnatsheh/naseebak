"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { isAndroidUserAgent, playStoreHref } from "@/lib/app-download";
import { trackEvent } from "@/lib/analytics";

const DEFAULT_PLAY_URL = "https://play.google.com/store/apps/details?id=com.naseebak.naseebakApp";

/**
 * /dashboard/install on an Android phone: the Play Store app first (push works there without any setup),
 * the website's own notification steps stay below it. Store link from `GET /api/mobile/config`.
 */
export function AppDownloadCard() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!isAndroidUserAgent(ua)) return;
    let live = true;
    fetch("/api/mobile/config")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((c: { android?: { storeUrl?: string } } | null) => {
        if (live) setHref(playStoreHref(c?.android?.storeUrl || DEFAULT_PLAY_URL, "install_page", ua));
      });
    return () => {
      live = false;
    };
  }, []);

  if (!href) return null;

  return (
    <Card className="overflow-hidden border-accent/40 bg-gradient-to-l from-accent/10 to-transparent">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
          <img src="/images/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl shadow-md" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-foreground">الأسهل: تطبيق نصيبك</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              الإشعارات تعمل في التطبيق تلقائياً، بدون أي إعدادات. نفس الحساب ونفس الرقم.
            </p>
          </div>
        </div>
        <a
          href={href}
          onClick={() => trackEvent("app_download_click", { place: "install_page" })}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground sm:w-auto"
        >
          <Smartphone className="h-5 w-5" aria-hidden />
          تحميل من Google Play
        </a>
        <p className="text-xs text-muted-foreground">أو فعّل الإشعارات على الموقع بالخطوات أدناه.</p>
      </CardContent>
    </Card>
  );
}
