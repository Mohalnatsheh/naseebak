"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/dashboard-context";

const DISMISS_KEY = "naseeb:guardian-consent-dismissed";

/**
 * One-time ask for existing users: their guardian contact was collected as admin-only,
 * so it is never shared with another family until they agree here (or in a request dialog).
 */
export function GuardianConsentCard() {
  const { counts, refreshUnread, profile } = useDashboardData();
  const female = profile?.gender === "FEMALE";
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const g = counts.guardian;
  if (!counts.flags.introRequests || !g?.exists || g.consented || dismissed) return null;

  async function agree() {
    setBusy(true);
    const res = await fetch("/api/profile/guardian-consent", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast.success("تم حفظ موافقتك");
      refreshUnread();
    } else {
      toast.error("تعذّر حفظ الموافقة، حاول مرة أخرى");
    }
  }

  function later() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/[0.06] to-transparent">
      <button
        type="button"
        onClick={later}
        aria-label="لاحقاً"
        className="absolute top-3 end-3 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="flex flex-col gap-4 pt-5 pb-5 sm:flex-row sm:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-bold text-foreground">التعارف العائلي أصبح أسهل</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {female
              ? "عند بدء تعارف عائلي تتبادل العائلتان بيانات وليّ الأمر مباشرة. هل توافقين على مشاركة اسم ورقم وليّ أمركِ مع العائلة الأخرى في هذه الحالة فقط؟"
              : "عند بدء تعارف عائلي تتبادل العائلتان بيانات وليّ الأمر مباشرة. هل توافق على مشاركة اسم ورقم وليّ أمرك مع العائلة الأخرى في هذه الحالة فقط؟"}
          </p>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <Button onClick={agree} disabled={busy} className="flex-1">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            أوافق
          </Button>
          <Button variant="ghost" onClick={later} disabled={busy} className="flex-1">
            لاحقاً
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
