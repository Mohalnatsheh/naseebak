"use client";

import { useState } from "react";
import { CheckCircle2, CircleDollarSign, Crown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadError } from "@/components/shared/load-error";
import { ProBadge } from "@/components/shared/pro-badge";
import { MyProCard, PRO_FEATURE_LABELS } from "@/components/payments/my-pro-card";
import { useDashboardData } from "@/contexts/dashboard-context";
import { trackEvent } from "@/lib/analytics";
import { forViewer } from "@/lib/gendered-copy";
import { formatPrice } from "@/lib/payments/packages";
import { PRO_PLAN_IDS, PRO_PLAN_LABELS, type ProPlanId, type ProPlanOffer } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";
import { arabicCount, cn } from "@/lib/utils";

const PER_PERIOD: Record<ProPlanId, string> = { weekly: "في الأسبوع", monthly: "في الشهر", yearly: "في السنة" };
// Weekly and monthly plans grant on each renewal; yearly grants a monthly amount every month
const CREDITS_EVERY: Record<ProPlanId, string> = { weekly: "كل أسبوع", monthly: "كل شهر", yearly: "كل شهر" };

/** One line on what Pro gives; the free credits only when a plan has some */
export function proPitch(offers: Pick<ProPlanOffer, "credits">[]): string {
  const credits = offers.some((o) => o.credits > 0) ? "، ويصلك رصيد مجاني مع الاشتراك" : "";
  return `مع Pro يمكنك إرسال الصور والرسائل الصوتية في المحادثة${credits}.`;
}

/** «8 أرصدة مجاناً كل شهر» */
export function proCreditsLine(offer: Pick<ProPlanOffer, "id" | "credits">): string {
  const count = arabicCount(offer.credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" });
  return `${count} مجاناً ${CREDITS_EVERY[offer.id]}`;
}

/** Starts a Pro checkout and leaves for its page (Stripe, or the local mock). The error is in Arabic from the server. */
export function useProCheckout() {
  const [buying, setBuying] = useState<ProPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(offer: ProPlanOffer) {
    if (buying) return;
    setBuying(offer.id);
    setError(null);
    try {
      const res = await fetch("/api/pro/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: offer.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.url === "string") {
        trackEvent("begin_checkout", { currency: offer.currency, package_name: `pro_${offer.id}` });
        window.location.assign(data.url);
        return; // keep the spinner while the page leaves
      }
      setError(data.error || "تعذّر بدء عملية الدفع الآن. حاول مرة أخرى بعد قليل.");
    } catch {
      setError("حدث خطأ في الاتصال");
    }
    setBuying(null);
  }

  return { buying, error, buy };
}

/** The plan picked first: monthly when it is offered */
export function defaultProPlan(offers: Pick<ProPlanOffer, "id">[]): ProPlanId | null {
  return offers.find((o) => o.id === "monthly")?.id ?? offers[0]?.id ?? null;
}

/**
 * Pro as ONE compact card (payments page and the chat's offer dialog): a weekly / monthly / yearly selector
 * (monthly first), the chosen plan's price, its free credits, what Pro gives and one subscribe button.
 * The button is disabled when buying isn't possible.
 */
export function ProPlanChooser({ offers, canBuy }: { offers: ProPlanOffer[]; canBuy: boolean }) {
  const { profile } = useDashboardData();
  const gender = profile?.gender;
  const { buying, error, buy } = useProCheckout();
  const sorted = [...offers].sort((a, b) => PRO_PLAN_IDS.indexOf(a.id) - PRO_PLAN_IDS.indexOf(b.id));
  const [picked, setPicked] = useState<ProPlanId | null>(null);
  const offer = sorted.find((o) => o.id === picked) ?? sorted.find((o) => o.id === defaultProPlan(sorted));
  if (!offer) return null;

  return (
    <div className="space-y-2.5">
      <Card className="relative gap-0 overflow-hidden border-accent/40 py-0 shadow-md shadow-accent/10">
        <div className="h-1.5 bg-gradient-to-l from-accent to-accent/60" aria-hidden />
        <CardContent className="space-y-3.5 p-4 sm:p-5">
          {sorted.length > 1 && (
            <div
              role="radiogroup"
              aria-label="مدة الاشتراك"
              className="grid gap-1 rounded-xl bg-muted p-1"
              style={{ gridTemplateColumns: `repeat(${sorted.length}, minmax(0, 1fr))` }}
            >
              {sorted.map((o) => {
                const on = o.id === offer.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(o.id)}
                    className={cn(
                      "h-11 rounded-lg text-sm font-bold transition-all",
                      on ? "bg-card text-primary shadow-sm ring-1 ring-accent/40" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {PRO_PLAN_LABELS[o.id]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-primary">{formatPrice({ price: offer.price, currency: offer.currency })}</span>
                <span className="text-sm font-semibold text-muted-foreground">{PER_PERIOD[offer.id]}</span>
              </div>
              {offer.chargeCurrency === "usd" && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  {forViewer(gender, "تدفع", "تدفعين")} {(offer.chargeAmount / 100).toFixed(2)}$ بالدولار
                </p>
              )}
            </div>
            {offer.id === "monthly" && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">الأكثر طلباً</span>
            )}
          </div>

          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {offer.credits > 0 && (
              <li className="flex items-center gap-2.5 font-semibold text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                </span>
                {proCreditsLine(offer)}
              </li>
            )}
            {PRO_FEATURE_LABELS.map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                </span>
                {f}
              </li>
            ))}
          </ul>

          <Button
            className="h-12 w-full rounded-xl border-0 bg-accent text-base font-bold text-accent-foreground hover:brightness-110"
            disabled={!canBuy || buying !== null}
            onClick={() => buy(offer)}
          >
            {buying === offer.id ? <Loader2 className="h-5 w-5 animate-spin" /> : forViewer(gender, "اشترك الآن", "اشتركي الآن")}
          </Button>
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        يتجدد الاشتراك تلقائياً، ويمكنك إلغاء التجديد في أي وقت. الرصيد المجاني يُضاف إلى رصيدك ولا تنتهي صلاحيته.
      </p>
    </div>
  );
}

/**
 * The Pro block at the top of /dashboard/payments (anchor #pro). Shown only while sales are on or the member is Pro:
 * a switched-off feature is never described. A failed load is said generically, without naming Pro.
 */
export function ProSection({
  state,
  loadFailed,
  onRetry,
  onChanged,
}: {
  state: MyProState | null;
  loadFailed: boolean;
  onRetry: () => void;
  /** After cancel/resume: reload the state */
  onChanged: () => void;
}) {
  if (loadFailed) {
    return <LoadError message="تعذّر تحميل جزء من هذه الصفحة. تحقّق من الاتصال وحاول مرة أخرى." onRetry={onRetry} />;
  }
  if (!state || !(state.enabled || state.isPro)) return null;

  return (
    <section id="pro" className="scroll-mt-24 space-y-4" aria-labelledby="pro-title">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/70 shadow-lg shadow-accent/20">
          <Crown className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="pro-title" className="flex items-center gap-2 text-xl font-bold text-foreground">
            عضوية <ProBadge size="md" />
          </h2>
          <p className="text-sm text-muted-foreground">
            {state.isPro
              ? "مزايا Pro فعّالة في حسابك."
              : proPitch(state.offers)}
          </p>
        </div>
      </div>

      {state.isPro ? (
        <MyProCard state={state} onChanged={onChanged} />
      ) : (
        <>
          {!state.canBuy && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              الاشتراك في Pro غير متاح في دولتك حالياً.
            </div>
          )}
          {state.offers.length > 0 && <ProPlanChooser offers={state.offers} canBuy={state.canBuy} />}
        </>
      )}
    </section>
  );
}
