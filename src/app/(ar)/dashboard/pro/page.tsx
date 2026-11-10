"use client";

import { useState, useEffect, useEffectEvent, useCallback, useRef, useSyncExternalStore, Suspense } from "react";
import Link from "@/components/shared/site-link";
import { useRouter, useSearchParams } from "next/navigation";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { FixedToast, type FixedToastMessage } from "@/components/shared/fixed-toast";
import { ProSection, proPageDescription } from "@/components/payments/pro-section";
import { useDashboardData } from "@/contexts/dashboard-context";
import { trackEvent } from "@/lib/analytics";
import { COUNTRIES, toCountry } from "@/lib/countries";
import { isLocalHostname } from "@/lib/local-host";
import { markPageNotificationsRead } from "@/lib/notifications-client";
import { waitForProActivation } from "@/lib/pro/activation";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import type { MyProState } from "@/lib/pro/pro-types";

/** Outcomes of a local mock Pro checkout (`POST /api/dev/mock-checkout/[id]`) */
const MOCK_PRO_OUTCOMES = ["paid", "cancelled", "renew", "fail", "end"] as const;

const noSubscribe = () => () => {};
const isLocalHost = () => isLocalHostname(window.location.hostname);

function Loading() {
  return (
    <div role="status" className="flex min-h-[60vh] justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}

/** Pro on its own page (owner, 2026-11-10): the plans or «اشتراكي», the Stripe return and the local mock checkout */
export default function ProPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProContent />
    </Suspense>
  );
}

function ProContent() {
  // Opening this page clears the bell for the Pro notices
  useEffect(() => {
    markPageNotificationsRead(PRO_PAGE_PATH);
  }, []);

  const { refreshUnread, refreshProfile, loading: dashboardLoading, country: memberCountry } = useDashboardData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<MyProState | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<FixedToastMessage | null>(null);
  const [mockBusy, setMockBusy] = useState<string | null>(null);
  const [mockResult, setMockResult] = useState<string | null>(null);

  /** `quiet`: a refetch (activation polling) whose failure keeps the last known state instead of the load error */
  const loadPro = useCallback(async (quiet = false): Promise<MyProState | null> => {
    try {
      const res = await fetch("/api/pro");
      if (!res.ok) throw new Error(`pro ${res.status}`);
      const data = (await res.json()) as MyProState;
      setState(data);
      setFailed(false);
      return data;
    } catch (err) {
      console.error(err);
      if (!quiet) setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    loadPro().finally(() => setLoading(false));
  }, [loadPro]);

  // The activation wait stops when the member leaves the page
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Analytics only: the currency is read when the payment is confirmed, not a reason to re-check it
  const trackPaid = useEffectEvent(() =>
    trackEvent("payment_success", { currency: COUNTRIES[toCountry(memberCountry)].currency.code })
  );

  // Back from the Pro checkout (?pro=success|cancel): the webhook may land a moment later, so wait for it up to 10 s
  const proReturn = searchParams.get("pro");
  const handledProReturn = useRef<string | null>(null);
  const onProReturn = useEffectEvent(async (kind: string) => {
    router.replace(PRO_PAGE_PATH);
    if (kind !== "success") {
      setToast({ type: "info", message: "لم تكتمل عملية الدفع" });
      return;
    }
    setToast({ type: "success", message: "تم الدفع بنجاح! جاري تفعيل اشتراك Pro…" });
    // A failed poll keeps the page as it was (no load-error flash); the next one tries again
    const outcome = await waitForProActivation({ load: () => loadPro(true), isMounted: () => mounted.current });
    if (outcome === "active") {
      // Only a confirmed activation counts as paid (QA WEB-PAY-19): `?pro=success` alone can be typed or replayed
      trackPaid();
      setToast({ type: "success", message: "تم تفعيل اشتراك Pro" });
      refreshUnread();
      refreshProfile();
    } else if (outcome === "timeout") {
      setToast({ type: "info", message: "تم استلام الدفع، وسيظهر اشتراكك خلال دقائق." });
    }
  });
  useEffect(() => {
    if (!proReturn || handledProReturn.current === proReturn) return;
    handledProReturn.current = proReturn;
    onProReturn(proReturn);
  }, [proReturn]);

  // Sales switched off and no subscription: nothing to show here (an old notice or link), so go to the credits page
  // instead of naming a switched-off feature (Pro review minor 4). Never during a checkout return or the mock panel.
  const salesOffNotPro = !!state && !state.enabled && !state.isPro;
  const busyReturn = !!proReturn || !!searchParams.get("mockPro");
  useEffect(() => {
    if (salesOffNotPro && !busyReturn) router.replace("/dashboard/payments");
  }, [salesOffNotPro, busyReturn, router]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Local mock Pro checkout (PAYMENTS_MOCK): /dashboard/pro?mockPro=<paymentId> shows dev buttons in place of Stripe.
  // Only on this machine (the dev route refuses everywhere else anyway): never a dev panel on naseebak.com
  const localHost = useSyncExternalStore(noSubscribe, isLocalHost, () => false);
  const mockProId = localHost ? searchParams.get("mockPro") : null;
  async function runMockPro(outcome: (typeof MOCK_PRO_OUTCOMES)[number]) {
    if (!mockProId || mockBusy) return;
    setMockBusy(outcome);
    try {
      const res = await fetch(`/api/dev/mock-checkout/${encodeURIComponent(mockProId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      const data = await res.json().catch(() => ({}));
      setMockResult(`${outcome}: ${res.status} ${JSON.stringify(data.result ?? data.error ?? null)}`);
      await loadPro();
      refreshUnread();
      refreshProfile();
    } catch (err) {
      setMockResult(`${outcome}: ${String(err)}`);
    } finally {
      setMockBusy(null);
    }
  }

  if (loading || dashboardLoading) return <Loading />;

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-8">
      <FixedToast toast={toast} />

      <PageHeader icon={Crown} title="عضوية Pro" description={proPageDescription(state)} />

      {mockProId && (
        <div dir="ltr" className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Mock Pro checkout (local only)</p>
          <div className="flex flex-wrap gap-2">
            {MOCK_PRO_OUTCOMES.map((o) => (
              <Button key={o} size="sm" variant="outline" disabled={mockBusy !== null} onClick={() => runMockPro(o)}>
                {mockBusy === o && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {o}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => router.replace(PRO_PAGE_PATH)}>
              close
            </Button>
          </div>
          {mockResult && <p className="break-all font-mono text-xs text-muted-foreground">{mockResult}</p>}
        </div>
      )}

      <ProSection state={state} loadFailed={failed} onRetry={() => loadPro()} onChanged={() => loadPro()} />

      {state && (state.enabled || state.isPro) && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          <Link href="/dashboard/payments" className="font-semibold text-primary underline-offset-4 hover:underline">
            الرصيد وسجل المدفوعات
          </Link>
          {" · "}
          <Link href="/refund-policy" className="font-semibold text-primary underline-offset-4 hover:underline">
            سياسة الاسترداد
          </Link>
        </p>
      )}
    </div>
  );
}
