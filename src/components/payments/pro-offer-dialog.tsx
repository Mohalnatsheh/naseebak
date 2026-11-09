"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadError } from "@/components/shared/load-error";
import { ProBadge } from "@/components/shared/pro-badge";
import { ProPlanChooser, proPitch } from "@/components/payments/pro-section";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";

/**
 * The Pro offer, opened from the chat's greyed photo / voice buttons. Loads /api/pro each time it opens and offers the
 * same compact plan chooser as the Pro page, or a link there when buying isn't possible from here.
 */
export function ProOfferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { profile } = useDashboardData();
  const [state, setState] = useState<MyProState | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped by «إعادة المحاولة» to load again
  const [attempt, setAttempt] = useState(0);
  // Fresh state on every open (the member may have bought or cancelled elsewhere meanwhile): reset while rendering
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setState(null);
      setFailed(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let stale = false;
    fetch("/api/pro")
      .then((res) => {
        if (!res.ok) throw new Error(`pro ${res.status}`);
        return res.json() as Promise<MyProState>;
      })
      .then((data) => {
        if (!stale) setState(data);
      })
      .catch((err) => {
        console.error(err);
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [open, attempt]);

  function retry() {
    setFailed(false);
    setState(null);
    setAttempt((n) => n + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto text-right sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2">
            {state?.isPro ? "عضويتك" : forViewer(profile?.gender, "اشترك في", "اشتركي في")} <ProBadge size="md" />
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {state?.isPro
              ? "مزايا Pro فعّالة في حسابك."
              : proPitch(state?.offers ?? [])}
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <LoadError onRetry={retry} />
        ) : !state ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="جاري التحميل" />
          </div>
        ) : state.canBuy ? (
          <ProPlanChooser offers={state.offers} canBuy />
        ) : !state.isPro && !state.enabled ? (
          // Sales are off: no link to a page that won't show Pro
          <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            الاشتراك في Pro غير متاح حالياً.
          </p>
        ) : (
          <div className="space-y-3">
            {!state.isPro && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                الاشتراك في Pro غير متاح هنا حالياً.
              </p>
            )}
            <Button asChild variant="outline" className="h-11 w-full rounded-xl">
              <Link href={PRO_PAGE_PATH} onClick={() => onOpenChange(false)}>
                {state.isPro ? "إدارة اشتراكي" : "صفحة عضوية Pro"}
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
