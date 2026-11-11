"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Crown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SealMark } from "@/components/shared/match-seal";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { forViewer } from "@/lib/gendered-copy";
import { PRO_PLAN_LABELS } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";
import { arabicCount } from "@/lib/utils";

/** Pro chat delete, listed only while `chat_delete_enabled` is on (copy never names a switched-off feature) */
export const PRO_CHAT_DELETE_LABEL = "حذف الرسائل ومسح المحادثة";

/** What every Pro plan gives (plan cards and «اشتراكي») */
export function proFeatureLabels(chatDelete = false): string[] {
  return [
    "إرسال الصور في المحادثة",
    "الرسائل الصوتية في المحادثة",
    ...(chatDelete ? [PRO_CHAT_DELETE_LABEL] : []),
    "شارة Pro على بطاقتك",
    "أولوية في الاقتراحات",
  ];
}

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

  // The same order as the app's «اشتراكي» (web-pay P3): gold rule → seal, title, plan → renewal state → the date (or
  // the failed renewal) → what happens next → the plan's credits and what Pro gives → one full-width button
  return (
    <Card data-testid="my-pro" className="gap-0 overflow-hidden border-accent/50 py-0">
      <div className="h-1.5 bg-gradient-to-l from-accent to-accent/60" aria-hidden />
      <CardContent className="space-y-3 p-4 md:p-6">
        <div className="flex items-center gap-2.5">
          <SealMark size={34} icon={Crown} label="عضوية Pro" />
          <h2 className="flex-1 text-headline text-ink">اشتراكي</h2>
          {state.plan && (
            <span className="rounded-full bg-primary/5 px-3 py-1 text-label text-primary">الباقة: {PRO_PLAN_LABELS[state.plan]}</span>
          )}
        </div>

        <span data-testid="pro-status" className={`inline-flex rounded-full border px-3 py-1 text-label font-bold ${status.tone}`}>
          {status.label}
        </span>

        {state.pastDue ? (
          // One headline, then what happens (Pro design P1); the paid period's end is in the line (WEB-PAY-04)
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-bold">لم ينجح تجديد الدفع.</span>
              {date ? `مزايا Pro مستمرة حتى ${date}. ` : ""}
              سنحاول مرة أخرى تلقائياً خلال الأيام القادمة، وإن لم ينجح الدفع ينتهي الاشتراك. يمكنك التأكد من بطاقتك أو رصيدها، وإن
              انتهى الاشتراك يمكنك الاشتراك من جديد ببطاقة أخرى.
            </span>
          </div>
        ) : (
          date && (
            <p className="flex items-center gap-2 text-base font-bold tabular-nums text-foreground">
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              {state.cancelAtPeriodEnd ? `ينتهي في ${date}` : `يتجدد في ${date}`}
            </p>
          )
        )}

        {state.cancelAtPeriodEnd && !state.pastDue && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            ألغيت التجديد، وتبقى مزايا Pro حتى هذا التاريخ. يمكنك متابعة الاشتراك قبل ذلك.
          </p>
        )}

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {creditsLine && (
            <li data-testid="pro-credits-line" className="flex items-center gap-2 font-semibold tabular-nums text-ink">
              <Sparkles className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
              {creditsLine}
            </li>
          )}
          {proFeatureLabels(state.chatDelete).map((f) => (
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

        {state.cancelAtPeriodEnd ? (
          <Button size="cta" className="w-full rounded-xl font-bold" disabled={busy !== null} onClick={() => manage("resume")}>
            {busy === "resume" && <Loader2 className="h-4 w-4 animate-spin" />}
            متابعة الاشتراك
          </Button>
        ) : (
          <Button
            variant="outline"
            size="cta"
            className="w-full rounded-xl"
            disabled={busy !== null}
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            إلغاء التجديد
          </Button>
        )}
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
