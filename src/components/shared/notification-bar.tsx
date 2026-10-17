"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellOff, BellRing, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPushPermission } from "@/lib/push-client";
import { currentDevice, pushPermission, type PushPermission } from "@/lib/install-env";

const HIDDEN_KEY = "naseeb:notification-bar-hidden";

/**
 * Thin bar at the top of every dashboard page while notifications are off on this device:
 * - not asked yet: one-tap «تفعيل»
 * - blocked: link to the unblock steps
 * - not possible here (iPhone before installing, Instagram's browser…): link to the install guide
 * «لاحقاً» hides it until the browser is closed. Not shown in a chat room (full screen) or on the guide.
 */
export function NotificationBar() {
  const pathname = usePathname();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(pushPermission());
    try {
      setHidden(sessionStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, [pathname]);

  if (hidden || permission === null || permission === "granted") return null;
  if (/^\/dashboard\/chats\/[^/]+/.test(pathname) || pathname.startsWith("/dashboard/install")) return null;
  if (pathname.startsWith("/dashboard/profile/setup")) return null;

  function hide() {
    try {
      sessionStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // private mode: hidden for this page only
    }
    setHidden(true);
  }

  async function enable() {
    setBusy(true);
    try {
      await requestPushPermission();
    } finally {
      setPermission(pushPermission());
      setBusy(false);
    }
  }

  const device = currentDevice();
  const needsInstall = permission === "unsupported";
  const Icon = permission === "denied" ? BellOff : needsInstall ? Smartphone : BellRing;
  const text =
    permission === "denied"
      ? "الإشعارات محظورة على هذا الجهاز، فلن تصلك الاقتراحات والرسائل فور وصولها."
      : needsInstall
        ? device.inApp
          ? "لتصلك الإشعارات افتح نصيبك في المتصفح ثم ثبّته على جهازك."
          : "لتصلك الإشعارات على هذا الجهاز ثبّت نصيبك على الشاشة الرئيسية."
        : "فعّل الإشعارات لتصلك الاقتراحات وطلبات التعارف والرسائل فور وصولها.";

  return (
    <div
      role="region"
      aria-label="الإشعارات"
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs sm:gap-3 sm:text-sm"
    >
      <Icon className="h-5 w-5 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed text-foreground/90">{text}</p>
      {permission === "default" ? (
        <Button size="sm" onClick={enable} disabled={busy} className="flex-shrink-0">
          تفعيل
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline" className="flex-shrink-0">
          <Link href="/dashboard/install">{needsInstall ? "طريقة التثبيت" : "طريقة التفعيل"}</Link>
        </Button>
      )}
      <button
        type="button"
        onClick={hide}
        aria-label="لاحقاً"
        className="flex-shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
