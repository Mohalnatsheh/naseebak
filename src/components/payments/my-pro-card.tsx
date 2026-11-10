"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProBadge } from "@/components/shared/pro-badge";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { forViewer } from "@/lib/gendered-copy";
import { PRO_PLAN_LABELS } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";
import { arabicCount } from "@/lib/utils";

/** What every Pro plan gives (plan cards and «اشتراكي») */
export const PRO_FEATURE_LABELS = ["إرسال الصور في المحادثة", "الرسائل الصوتية في المحادثة", "شارة Pro على بطاقتك"] as const;

/** «اشتراكي»: the member's live Pro subscription, its renewal or end date, and cancel / resume */
export function MyProCard({ state, onChanged }: { state: MyProState; onChanged: () => void }) {
  const { profile, country } = useDashboardData();
  const gender = profile?.gender;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const date = state.renewsAt ? formatDate(state.renewsAt, country, { year: "numeric", month: "long", day: "numeric" }) : null;
  const nextGrant = state.nextGrantAt ? formatDate(state.nextGrantAt, country, { month: "long", day: "numeric" }) : null;
  const perGrant = state.creditsPerGrant ?? 0;
  // «8 أرصدة كل شهر · الدفعة القادمة في 10 ديسمبر» (QA WP2-18)
  const creditsLine =
    perGrant > 0 && state.plan
      ? `${arabicCount(perGrant, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" })} ${state.plan === "weekly" ? "كل أسبوع" : "كل شهر"}${
          nextGrant ? ` · الدفعة القادمة في ${nextGrant}` : ""
        }`
      : null;
  // The status chip (Pro design P1): the state in one word, the date as the anchor under it
  const status = state.pastDue
    ? { label: "تعذّر التجديد", tone: "border-amber-300 bg-amber-50 text-amber-900" }
    : state.cancelAtPeriodEnd
      ? { label: "ينتهي قريباً", tone: "border-border bg-muted text-foreground" }
      : { label: "فعّال", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };

  async function manage(action: "cancel" | "resume") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/pro/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "تعذّر تحديث الاشتراك الآن. يمكنك المحاولة مرة أخرى بعد قليل.");
        return;
      }
      setConfirmOpen(false);
      onChanged();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
            اشتراكي <ProBadge size="md" />
          </h3>
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="pro-status" className={`rounded-full border px-3 py-1 text-sm font-bold ${status.tone}`}>
              {status.label}
            </span>
            {state.plan && (
              <span className="rounded-full bg-primary/5 px-3 py-1 text-sm font-semibold text-primary">
                الباقة: {PRO_PLAN_LABELS[state.plan]}
              </span>
            )}
          </span>
        </div>

        {/* The date first: when it renews, or ends */}
        {date && (
          <p className="flex items-center gap-2 text-base font-bold text-foreground">
            <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            {state.pastDue ? `مزايا Pro مستمرة حتى ${date}` : state.cancelAtPeriodEnd ? `ينتهي في ${date}` : `يتجدد في ${date}`}
          </p>
        )}
        {creditsLine && (
          <p data-testid="pro-credits-line" className="-mt-2 text-sm text-muted-foreground">
            {creditsLine}
          </p>
        )}

        {state.pastDue && (
          // One headline, then what happens (Pro design P1); the paid period's end is the date above (WEB-PAY-04)
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-bold">لم ينجح تجديد الدفع.</span>
              سنحاول مرة أخرى تلقائياً خلال الأيام القادمة، وإن لم ينجح الدفع ينتهي الاشتراك. يمكنك التأكد من بطاقتك أو رصيدها، وإن
              انتهى الاشتراك يمكنك الاشتراك من جديد ببطاقة أخرى.
            </span>
          </div>
        )}

        {state.cancelAtPeriodEnd && !state.pastDue && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            ألغيت التجديد، وتبقى مزايا Pro حتى هذا التاريخ. يمكنك متابعة الاشتراك قبل ذلك.
          </p>
        )}

        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          {PRO_FEATURE_LABELS.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>

        {error && !confirmOpen && (
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {state.cancelAtPeriodEnd ? (
            <Button className="h-11 rounded-xl px-5 font-bold" disabled={busy !== null} onClick={() => manage("resume")}>
              {busy === "resume" && <Loader2 className="h-4 w-4 animate-spin" />}
              متابعة الاشتراك
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-11 rounded-xl px-5"
              disabled={busy !== null}
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
            >
              إلغاء التجديد
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(o) => busy === null && setConfirmOpen(o)}>
        <DialogContent dir="rtl" className="sm:max-w-md text-right">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>إلغاء تجديد Pro</DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              {date && !state.pastDue
                ? `يبقى اشتراكك فعّالاً حتى ${date}، ثم ينتهي ولن يُخصم أي مبلغ آخر.`
                : "ينتهي اشتراكك في نهاية الفترة المدفوعة، ولن يُخصم أي مبلغ آخر."}{" "}
              {forViewer(gender, "الرصيد الذي حصلت عليه يبقى لك.", "الرصيد الذي حصلتِ عليه يبقى لكِ.")}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
            <Button variant="destructive" disabled={busy !== null} onClick={() => manage("cancel")} className="h-11 flex-1 rounded-xl sm:flex-none">
              {busy === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}
              إلغاء التجديد
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmOpen(false)} className="h-11 flex-1 rounded-xl sm:flex-none">
              {forViewer(gender, "تراجع", "تراجعي")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
