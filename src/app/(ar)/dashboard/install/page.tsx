"use client";

import { useState } from "react";
import { BellRing, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { detectDevice } from "@/lib/install-env";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { InstallSteps } from "@/components/shared/install-guide";
import { PushSetupFlow } from "@/components/shared/push-setup";
import { PageHeader } from "@/components/shared/page-header";

type Tab = "ios" | "android";

/** Sample devices for helping someone else (or a misdetected browser). */
const IPHONE = detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1");
const ANDROID = detectDevice("Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36");

/**
 * Turn on notifications on this phone: the guided setup (same as the bottom sheet), then the install
 * steps for another iPhone / Android. The "open in Safari / Chrome" button of the setup lands here.
 */
export default function InstallGuidePage() {
  const gender = useDashboardData().profile?.gender;
  const [tab, setTab] = useState<Tab>("ios");

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-8">
      <PageHeader
        icon={BellRing}
        title={forViewer(gender, "فعّل الإشعارات", "فعّلي الإشعارات")}
        description={forViewer(
          gender,
          "لتعرف فوراً بالاقتراحات الجديدة والتوافق والرسائل، حتى والموقع مغلق.",
          "لتعرفي فوراً بالاقتراحات الجديدة والتوافق والرسائل، حتى والموقع مغلق."
        )}
      />

      <Card className="border-primary/10">
        <CardContent className="p-5 sm:p-6">
          <PushSetupFlow gender={gender} />
        </CardContent>
      </Card>

      <details className="group rounded-2xl border border-border bg-card p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">
          خطوات التثبيت لجهاز آخر
          <ChevronLeft className="h-4 w-4 transition-transform group-open:-rotate-90" />
        </summary>
        <div className="mt-3 space-y-4">
          <div role="tablist" aria-label="نوع الجهاز" className="flex gap-2">
            {([
              ["ios", "iPhone"],
              ["android", "Android"],
            ] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "min-h-11 rounded-full border px-4 py-2 text-sm transition-colors",
                  tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <InstallSteps device={tab === "ios" ? IPHONE : ANDROID} />
        </div>
      </details>
    </div>
  );
}
