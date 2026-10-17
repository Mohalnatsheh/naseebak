"use client";

import { useEffect, useState } from "react";
import { BellRing, Smartphone, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { currentDevice, detectDevice, type Device } from "@/lib/install-env";
import { InstallSteps, NotificationHelp } from "@/components/shared/install-guide";

type Tab = "mine" | "ios" | "android";

/** Sample devices for the "other device" tabs (helping someone else, or a misdetected browser). */
const IPHONE = detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1");
const ANDROID = detectDevice("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36");

/** Install Naseebak on the phone and turn on notifications: steps for this device, plus iPhone / Android. */
export default function InstallGuidePage() {
  const [device, setDevice] = useState<Device | null>(null);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    setDevice(currentDevice());
  }, []);

  if (!device) return null;

  const shown = tab === "ios" ? IPHONE : tab === "android" ? ANDROID : device;
  const tabs: [Tab, string][] = [
    ["mine", "جهازي"],
    ["ios", "iPhone"],
    ["android", "Android"],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-4 sm:p-6 md:p-8">
        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <h1 className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
              ثبّت نصيبك وفعّل الإشعارات
            </h1>
          </div>
          <p className="text-sm text-muted-foreground md:text-base">
            أضف نصيبك إلى شاشة هاتفك ليفتح كتطبيق، وتصلك الاقتراحات وطلبات التعارف والرسائل فور وصولها.
          </p>
        </div>
      </div>

      <Card className="border-primary/10">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="font-bold">١. التثبيت على الهاتف</h2>
          </div>
          <div role="tablist" aria-label="نوع الجهاز" className="flex gap-2">
            {tabs.map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <InstallSteps device={shown} onInstalled={() => setDevice(currentDevice())} />
        </CardContent>
      </Card>

      <Card className="border-primary/10">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" />
            <h2 className="font-bold">٢. تفعيل الإشعارات على هذا الجهاز</h2>
          </div>
          <NotificationHelp device={device} />
          {device.os === "ios" && !device.standalone && (
            <p className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              على iPhone: ثبّت نصيبك أولاً، ثم افتحه من الأيقونة وارجع إلى هذه الصفحة (الإعدادات ← تثبيت التطبيق والإشعارات) لتفعيل الإشعارات.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
