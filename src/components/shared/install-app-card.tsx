"use client";

import { useEffect, useState } from "react";
import { Smartphone, Share, SquarePlus, BellRing, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Install Naseebak" card. Installing gives an app icon and, on iPhone, is the only way to get
 * notifications (Apple allows web push only for sites added to the Home Screen).
 * - Android / desktop Chromium: one-tap install via the browser's own dialog, then notification permission
 * - iPhone / iPad: a short Share → "Add to Home Screen" guide
 * Hidden when already installed, when the browser can't install, or for 14 days after "لاحقاً".
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "naseeb:install-card-dismissed-at";
const DISMISS_DAYS = 14;

// The browser may fire this before the card mounts, so catch it as soon as the module loads
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

type Mode = "hidden" | "install" | "ios";

export function InstallAppCard({ context = "dashboard" }: { context?: "dashboard" | "chats" }) {
  const [mode, setMode] = useState<Mode>("hidden");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const update = () => {
      if (isStandalone() || recentlyDismissed()) return setMode("hidden");
      if (isIos()) return setMode("ios");
      setMode(deferredPrompt ? "install" : "hidden");
    };
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (mode === "hidden") return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode: just hide for now
    }
    setMode("hidden");
  }

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === "accepted") {
        setMode("hidden");
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission().catch(() => {});
        }
      }
    } finally {
      setInstalling(false);
    }
  }

  const lead =
    context === "chats"
      ? "حتى تصلك رسائل المحادثات فور وصولها، حتى لو كان الموقع مغلقاً."
      : "حتى تصلك الاقتراحات وطلبات التعارف والرسائل فور وصولها.";

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/[0.06] to-transparent">
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className="absolute top-3 left-3 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 pe-6">
            <h3 className="font-bold text-foreground">ثبّت نصيبك على جهازك</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lead}</p>
          </div>
        </div>

        {mode === "install" ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={install} disabled={installing} className="gap-1.5 sm:w-auto">
              <Download className="h-4 w-4" />
              تثبيت التطبيق
            </Button>
            <Button variant="ghost" onClick={dismiss} className="sm:w-auto">
              لاحقاً
            </Button>
          </div>
        ) : (
          <ol className="mt-4 space-y-2.5 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
                <Share className="h-4 w-4 text-primary" />
              </span>
              <span>
                اضغط زر <span className="font-semibold">المشاركة</span> في أسفل المتصفح
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
                <SquarePlus className="h-4 w-4 text-primary" />
              </span>
              <span>
                اختر <span className="font-semibold">«إضافة إلى الشاشة الرئيسية»</span>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card ring-1 ring-border">
                <BellRing className="h-4 w-4 text-primary" />
              </span>
              <span>افتح نصيبك من الأيقونة الجديدة ووافق على الإشعارات</span>
            </li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
