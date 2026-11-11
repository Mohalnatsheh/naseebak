"use client";

import { useState, useEffect, useEffectEvent, useCallback, useRef, Suspense } from "react";
import Link from "@/components/shared/site-link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getStripe } from "@/lib/stripe-client";
import {
  Loader2,
  CheckCircle2,
  Crown,
  Sparkles,
  Receipt,
  Clock,
  Gem,
  CircleDollarSign,
  Coins,
  XCircle,
  ArrowRight,
  X,
  Zap,
  Shield,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { creditLine } from "@/lib/suggestions/copy";
import { arabicCount } from "@/lib/utils";
import { LoadError } from "@/components/shared/load-error";
import { MoneyAmount, UsdLine } from "@/components/payments/money";
import { EmptyState } from "@/components/shared/line-art";
import { PageHeader } from "@/components/shared/page-header";
import { markPageNotificationsRead } from "@/lib/notifications-client";
import { discountPercent } from "@/lib/payments/packages";
import { COUNTRIES, formatDate, toCountry, type CountryCode } from "@/lib/countries";
import { ProLinkCard } from "@/components/payments/pro-section";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import { PageLoading } from "@/components/shared/page-loading";
import { FixedToast, type FixedToastMessage } from "@/components/shared/fixed-toast";
import { isLocalHostname } from "@/lib/local-host";

/** How prices are shown and charged, under the packages */
const PRICE_NOTE: Record<CountryCode, string> = {
  JO: "الأسعار بالدينار الأردني، ويتم الخصم بما يعادلها بالدولار الأمريكي (يظهر في كشف الحساب باسم LOGICCR). البائع: LOGIC CENTER FOR WEBSITE DESIGN",
  // [NEEDS INPUT] statement descriptor and seller name for the Saudi Stripe account
  SA: "الأسعار بالريال السعودي، ويتم الدفع بالريال عبر Stripe",
  LB: "الأسعار بالدولار الأمريكي، ويتم الدفع بالدولار عبر Stripe",
};
/** Jordan once it is charged in dinars (switch jod_charging, sent by /api/payments/plans) */
const JO_JOD_NOTE = "الأسعار والدفع بالدينار الأردني (يظهر في كشف الحساب باسم LOGICCR). البائع: LOGIC CENTER FOR WEBSITE DESIGN";

/** Stripe's embedded checkout and Stripe.js load only once a checkout has started (QA PA-M3, WP2-06) */
const StripeEmbeddedCheckout = dynamic(() => import("@/components/payments/embedded-checkout"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جارٍ التحميل…" />
    </div>
  ),
});

/** The currency symbol of a history row, as on the package cards (QA WEB-PAY-08): «د.أ», «ر.س», «$» for old USD rows */
const CURRENCY_SYMBOLS: Record<string, string> = { JOD: "د.أ", SAR: "ر.س", USD: "$" };
const currencyLabel = (c: string) => CURRENCY_SYMBOLS[c] ?? c;


interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  /** «د.أ» / «ر.س» */
  currencySymbol?: string;
  /** Amount actually charged by Stripe, in USD (Jordan only) */
  chargeUsd?: number;
  /** What the card is charged: «4.23$» / «15 ر.س» */
  chargeLabel?: string;
  popular?: boolean;
  /** Opening offer: the old price, struck through */
  wasPrice?: number;
}

interface PaymentRecord {
  id: string;
  amount: string;
  currency: string;
  status: string;
  description: string;
  createdAt: string;
}

/** % cheaper per credit than the smallest package (0 for the smallest itself) */
function savingVsSmallest(pkg: { price: number; credits: number }, all: { price: number; credits: number }[]): number {
  const smallest = [...all].sort((a, b) => a.credits - b.credits)[0];
  if (!smallest || smallest.credits === pkg.credits) return 0;
  const base = smallest.price / smallest.credits;
  return Math.max(0, Math.round((1 - pkg.price / pkg.credits / base) * 100));
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex min-h-[70vh] flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            </div>
            </div>
          <p className="text-sm text-muted-foreground">
            جاري التحميل...
          </p>
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead("/dashboard/payments");
  }, []);

  // New cycle: a credit is spent per family/chat request, suggestions are free;
  // credit on interest: a credit is spent on "مهتم" instead, requests are free
  // `switchesLoading`: the copy depends on the switch flags, so wait for them (no legacy-copy flash)
  const { counts: { flags, pro }, refreshUnread, refreshProfile, loading: switchesLoading, country: memberCountry } = useDashboardData();
  // Packages, currency and wording follow the member's country (the plans answer names it)
  const [planCountry, setPlanCountry] = useState<string | null>(null);
  const country = COUNTRIES[toCountry(planCountry ?? memberCountry)];
  const currencySymbol = (pkg?: CreditPackage | null) => pkg?.currencySymbol ?? country.currency.symbol;
  const perRequest = flags.introRequests;
  const creditOnInterest = !!flags.creditOnInterest;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  // False while the member's country is not selling (prices not approved, switched off): say so before any click
  const [purchasesEnabled, setPurchasesEnabled] = useState(true);
  // Jordan charged in JOD (switch jod_charging): no dollar note
  const [jodCharging, setJodCharging] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [matchCredits, setMatchCredits] = useState(0);
  // Plans/history didn't load: never show a balance of 0 or an empty package list as if real
  const [loadFailed, setLoadFailed] = useState(false);
  // A history page turn failed: said in the history section only, never as an empty history
  const [histFailed, setHistFailed] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const [histTotalPages, setHistTotalPages] = useState(1);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [mockPayment, setMockPayment] = useState<{ id: string; name: string } | null>(null);
  const [mockBusy, setMockBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<FixedToastMessage | null>(null);

  // Embedded checkout state
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutPackageName, setCheckoutPackageName] = useState<string>("");
  const [checkoutPackage, setCheckoutPackage] = useState<CreditPackage | null>(null);
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(null);

  // The history page on screen, read by every reload (a ref: turning a page must not rebuild loadData and load twice)
  const histPageRef = useRef(1);
  const purchasingRef = useRef(false);
  const loadData = useCallback(async (p = histPageRef.current) => {
    try {
      const [plansRes, histRes] = await Promise.all([
        fetch("/api/payments/plans"),
        fetch(`/api/payments/history?page=${p}`),
      ]);
      if (!plansRes.ok || !histRes.ok) throw new Error(`payments ${plansRes.status}/${histRes.status}`);
      const plansData = await plansRes.json();
      const histData = await histRes.json();
      setLoadFailed(false);

      setPackages(plansData.packages || []);
      setPurchasesEnabled(plansData.purchasesEnabled !== false);
      setJodCharging(plansData.jodCharging === true);
      if (plansData.country) setPlanCountry(plansData.country);
      setPayments(histData.payments || []);
      setMatchCredits(histData.matchCredits ?? 0);
      setHistTotalPages(histData.totalPages || 1);
      setHistFailed(false);
    } catch (err) {
      console.error(err);
      setLoadFailed(true);
    }
  }, []);

  /** A history page turn: its own load, so a failure shows only in the history section (balance and packages stay) */
  const loadHistory = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/payments/history?page=${p}`);
      if (!res.ok) throw new Error(`history ${res.status}`);
      const histData = await res.json();
      setPayments(histData.payments || []);
      setMatchCredits(histData.matchCredits ?? 0);
      setHistTotalPages(histData.totalPages || 1);
      setHistFailed(false);
    } catch (err) {
      console.error(err);
      setHistFailed(true);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await loadData();
      setLoading(false);
    }
    init();
  }, [loadData]);

  // Pro lives on its own page (owner, 2026-11-10): a Stripe return or mock link made before the move (?pro=, ?mockPro=)
  // and the old anchor (#pro) go there
  const proQuery = searchParams.get("pro") ?? searchParams.get("mockPro");
  useEffect(() => {
    if (proQuery !== null) {
      router.replace(`${PRO_PAGE_PATH}?${searchParams.toString()}`);
    } else if (window.location.hash === "#pro") {
      router.replace(PRO_PAGE_PATH);
    }
  }, [proQuery, searchParams, router]);

  // Analytics only: the currency is read when the payment is confirmed, not a reason to re-check it
  const trackPaid = useEffectEvent(() => trackEvent("payment_success", { currency: country.currency.code }));

  // Handle return from embedded checkout
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      // The check itself failed (server or Stripe error, signed out): the payment may well be in, so never «لم تكتمل»
      const unsure = () => {
        setToast({ type: "info", message: "جارٍ التأكد من الدفع. إن اكتمل فسيظهر رصيدك هنا خلال دقائق." });
        loadData();
      };
      fetch(`/api/payments/session-status?session_id=${encodeURIComponent(sessionId)}`)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
        .then(({ ok, data }) => {
          if (!ok || typeof data.status !== "string") {
            unsure();
          } else if (data.status === "complete" && data.paymentStatus === "paid") {
            trackPaid();
            setToast({
              type: "success",
              message: "تم الدفع بنجاح! تمت إضافة الرصيد",
            });
            loadData();
            // The balance shown elsewhere (next-step card, sidebar) comes from the shared counts/profile
            refreshUnread();
            refreshProfile();
          } else {
            setToast({ type: "info", message: "لم تكتمل عملية الدفع" });
          }
          router.replace("/dashboard/payments");
        })
        .catch(() => {
          unsure();
          router.replace("/dashboard/payments");
        });
    }
  }, [searchParams, loadData, router, refreshUnread, refreshProfile]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // One-tap top-up from «مهتمون بك» at 0 credits: /dashboard/payments?buy=<packageId> starts that package's payment
  const startBuy = useEffectEvent((id: string) => {
    const pkg = packages.find((p) => p.id === id);
    router.replace("/dashboard/payments");
    if (pkg) handlePurchase(pkg.id, pkg.name);
  });
  const buyId = searchParams.get("buy");
  const packagesReady = packages.length > 0;
  useEffect(() => {
    if (buyId && packagesReady) startBuy(buyId);
  }, [buyId, packagesReady]);

  async function handlePurchase(packageId: string, packageName: string) {
    // One checkout at a time: a second tap (another pack) while the first is starting would open a second session
    if (purchasingRef.current) return;
    purchasingRef.current = true;
    setPurchasing(packageId);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const result = await res.json();
      // Arabic payment page (switch `arabic_checkout`): a full page on naseebak.com/pay
      if (res.ok && result.payUrl) {
        trackEvent("begin_checkout", { currency: country.currency.code, package_name: packageName });
        window.location.assign(result.payUrl);
        return;
      }
      // Local mock (PAYMENTS_MOCK, QA WEB-PAY-01): the dev panel below pays or cancels it, in place of Stripe
      if (res.ok && result.mock && result.paymentId) {
        if (isLocalHostname(window.location.hostname)) {
          setMockPayment({ id: result.paymentId, name: packageName });
          return;
        }
      }
      if (res.ok && result.clientSecret && !getStripe()) {
        // No publishable key on this site: never open a checkout that can't load (QA WA-18)
        setToast({ type: "error", message: "الدفع غير متاح حالياً. يمكنك المحاولة مرة أخرى لاحقاً." });
        if (result.paymentId) void fetch("/api/payments/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId: result.paymentId }) }).then(() => loadData());
        return;
      }
      if (res.ok && result.clientSecret) {
        trackEvent("begin_checkout", { currency: country.currency.code, package_name: packageName });
        setCheckoutSecret(result.clientSecret);
        setCheckoutPackageName(packageName);
        setCheckoutPackage(packages.find((p) => p.id === packageId) ?? null);
        setCheckoutPaymentId(result.paymentId ?? null);
        return;
      }
      console.error("Checkout failed:", result.error);
      setToast({
        type: "error",
        message: result.error || "حدث خطأ أثناء إنشاء عملية الدفع",
      });
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "حدث خطأ في الاتصال" });
    } finally {
      purchasingRef.current = false;
      setPurchasing(null);
    }
  }

  /** Local mock pack checkout: finish it as paid or cancelled through the dev route (credits added exactly once) */
  async function finishMockPayment(outcome: "paid" | "cancelled") {
    if (!mockPayment || mockBusy) return;
    setMockBusy(outcome);
    try {
      const res = await fetch(`/api/dev/mock-checkout/${encodeURIComponent(mockPayment.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) throw new Error(`mock ${res.status}`);
      setMockPayment(null);
      if (outcome === "paid") {
        setToast({ type: "success", message: "تم الدفع بنجاح! تمت إضافة الرصيد" });
        refreshUnread();
        refreshProfile();
      } else {
        setToast({ type: "info", message: "تم إلغاء عملية الدفع" });
      }
      loadData();
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "تعذّر إنهاء الدفع التجريبي" });
    } finally {
      setMockBusy(null);
    }
  }

  async function handleCancelPayment(paymentId: string) {
    if (cancellingId) return;
    setCancellingId(paymentId);
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      if (!res.ok) throw new Error(`cancel ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (data.paid) {
        // Paid in the meantime: the route credited it instead of cancelling
        setToast({ type: "success", message: "تم الدفع بنجاح! تمت إضافة الرصيد" });
        refreshUnread();
        refreshProfile();
      } else {
        setToast({ type: "info", message: "تم إلغاء عملية الدفع" });
      }
      loadData();
    } catch (err) {
      console.error(err);
      setToast({ type: "error", message: "تعذّر إلغاء عملية الدفع، يمكنك المحاولة مرة أخرى" });
    } finally {
      setCancellingId(null);
    }
  }

  async function closeCheckout() {
    const paymentId = checkoutPaymentId;
    setCheckoutSecret(null);
    setCheckoutPackageName("");
    setCheckoutPackage(null);
    setCheckoutPaymentId(null);
    // Closes this checkout on Stripe too, so it can no longer be paid
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentId ? { paymentId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (data.paid) {
        setToast({ type: "success", message: "تم الدفع بنجاح! تمت إضافة الرصيد" });
        refreshUnread();
        refreshProfile();
      }
    } catch (err) {
      console.error(err);
    }
    loadData();
  }

  if (loading || switchesLoading) {
    return <PageLoading width="max-w-4xl" />;
  }

  // Show embedded checkout form
  if (checkoutSecret) {
    return (
      // The checkout is a single-column form: the narrow width (review X4a minor 6)
      <div className="mx-auto max-w-2xl space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <Coins className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">إتمام الدفع</h2>
              <p className="text-sm text-muted-foreground">
                {checkoutPackageName}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={closeCheckout}
            className="rounded-xl text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4 me-1.5" />
            رجوع
          </Button>
        </div>

        {checkoutPackage?.chargeUsd ? (
          <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed">
            <p className="font-bold text-foreground">
              المبلغ الذي سيظهر في صفحة الدفع: {checkoutPackage.chargeUsd.toFixed(2)}$
              <span className="font-semibold text-muted-foreground"> (= {checkoutPackage.price} {currencySymbol(checkoutPackage)})</span>
            </p>
            <p className="text-muted-foreground mt-0.5">
              الدفع يتم بالدولار الأمريكي، وقد يحوّل بنكك المبلغ إلى الدينار حسب سعر الصرف لديه.
            </p>
          </div>
        ) : checkoutPackage ? (
          <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed">
            <p className="font-bold text-foreground">
              المبلغ الذي سيظهر في صفحة الدفع: {checkoutPackage.chargeLabel ?? `${checkoutPackage.price} ${currencySymbol(checkoutPackage)}`}
            </p>
          </div>
        ) : null}

        {/* Stripe's form has no Arabic, so the fields are explained here */}
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
          <p className="font-bold text-foreground">نموذج الدفع الآمن من Stripe يظهر بالإنجليزية:</p>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground sm:grid-cols-2">
            <li><span dir="ltr" className="font-semibold text-foreground">Email</span>: بريدك لاستلام الإيصال</li>
            <li><span dir="ltr" className="font-semibold text-foreground">Card number</span>: رقم البطاقة</li>
            <li><span dir="ltr" className="font-semibold text-foreground">MM / YY</span>: تاريخ انتهاء البطاقة</li>
            <li><span dir="ltr" className="font-semibold text-foreground">CVC</span>: الرمز المكوّن من 3 أرقام خلف البطاقة</li>
            <li><span dir="ltr" className="font-semibold text-foreground">Cardholder name</span>: الاسم كما على البطاقة</li>
            <li><span dir="ltr" className="font-semibold text-foreground">Pay</span>: زر إتمام الدفع</li>
          </ul>
        </div>

        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-0">
            <StripeEmbeddedCheckout clientSecret={checkoutSecret} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Package card icons based on index
  const packageIcons = [Zap, Crown, Gem];
  const packageFeatures = [
    creditOnInterest
      ? ["تجربة المنصة", "اختيار «مهتم» على الاقتراحات"]
      : perRequest ? ["تجربة المنصة", "طلبات تعارف أو محادثة"] : ["تجربة المنصة", "اقتراحات أساسية"],
    ["توفير أكثر", "أفضل قيمة"],
    ["أقل سعر للرصيد", "تجربة كاملة"],
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-8">
      {/* Toast notification */}
      <FixedToast toast={toast} />

      {mockPayment && (
        <div dir="ltr" className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Mock checkout (local only): {mockPayment.name}</p>
          <div className="flex flex-wrap gap-2">
            {(["paid", "cancelled"] as const).map((o) => (
              <Button key={o} size="sm" variant="outline" disabled={mockBusy !== null} onClick={() => finishMockPayment(o)}>
                {mockBusy === o && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {o}
              </Button>
            ))}
          </div>
        </div>
      )}

      {loadFailed && (
        <LoadError
          message="تعذّر تحميل رصيدك والباقات. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={() => loadData()}
        />
      )}

      {!loadFailed && (<>
      <PageHeader
        icon={Coins}
        title={perRequest ? "رصيدك" : "رصيد الاقتراحات"}
        description={
          creditOnInterest
            ? `الاقتراحات مجانية. ${creditLine(!!flags.freeInterestReply)}`
            : perRequest
            ? "الاقتراحات مجانية. كل طلب تعارف عائلي أو محادثة يستخدم رصيداً واحداً."
            : "يمكنك شحن رصيدك لتصلك اقتراحات أكثر"
        }
      >
        {/* Current balance */}
        <div className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-accent px-5 py-2 text-accent-foreground shadow-sm shadow-accent/20">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">رصيدك الحالي</span>
          <span className="text-2xl font-black leading-none tabular-nums">{matchCredits}</span>
          <span className="text-sm font-medium">رصيد</span>
        </div>
      </PageHeader>

      {/* Pro has its own page: one small link to it, only when there are plans to buy or a subscription to manage */}
      {pro?.showPage && <ProLinkCard isPro={pro.isPro} chatOn={!!flags.chat} />}

      {/* Opening offer: why the prices are low right now */}
      {packages.some((p) => discountPercent({ price: p.price, wasPrice: p.wasPrice })) && (
        <section className="landing-night relative overflow-hidden rounded-2xl px-4 py-4 text-white shadow-md shadow-primary/15 sm:px-6">
          <div className="landing-khatam absolute inset-0" aria-hidden />
          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground" aria-hidden>
              <PartyPopper className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg leading-tight sm:text-xl">خصم افتتاح نصيبك</h2>
              <p className="mt-0.5 text-sm text-white/75">
                احتفالاً بافتتاح المنصة: خصم حتى {Math.max(...packages.map((p) => discountPercent({ price: p.price, wasPrice: p.wasPrice }) ?? 0))}% على كل الباقات، لفترة محدودة.
              </p>
            </div>
          </div>
        </section>
      )}

      {!purchasesEnabled && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          شراء الرصيد غير متاح في دولتك حالياً.
        </div>
      )}

      {/* Credit Packages */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {packages.map((pkg, index) => {
          const Icon = packageIcons[index] || Gem;
          const features = packageFeatures[index] || [];

          return (
            <div
              key={pkg.id}
              style={{
                animation: `fadeSlideIn 0.5s ease-out ${0.15 + index * 0.12}s both`,
              }}
            >
              <Card
                className={`group relative gap-0 overflow-hidden py-0 transition-colors ${
                  pkg.popular ? "border-primary/60 ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                }`}
              >
                {/* Top accent line */}
                <div className={`h-1.5 ${pkg.popular ? "bg-gradient-to-l from-accent to-accent/70" : "bg-gradient-to-l from-primary to-primary-2"}`} />

                {/* Popular badge */}
                {pkg.popular && (
                  // «الأكثر طلباً» as an outlined navy chip (gold stays for fills on navy)
                  <div className="absolute top-4 start-4 z-10">
                    <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-card px-3 py-1 text-caption font-bold text-primary">
                      <Crown className="h-3.5 w-3.5" aria-hidden />
                      الأكثر طلباً
                    </div>
                  </div>
                )}

                {/* Background decorations for popular */}

                <CardContent
                  // Phones: a compact pack (name, price, button); the icon and the feature list from md up
                  className={`relative p-4 md:p-6 ${pkg.popular ? "pt-12 md:pt-12" : "md:pt-8"}`}
                >
                  {/* Icon */}
                  <div className="mb-5 hidden justify-center md:flex">
                    <div
                      className={`h-12 w-12 md:h-16 md:w-16 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${
                        pkg.popular
                          ? "bg-gradient-to-br from-accent to-accent/70 shadow-lg shadow-accent/25"
                          : "bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20"
                      }`}
                    >
                      <Icon className="h-6 w-6 md:h-8 md:w-8 text-white" />
                    </div>
                  </div>

                  {/* Package name */}
                  <h3 className="mb-1 text-headline text-ink md:mb-2 md:text-center">
                    {pkg.name}
                  </h3>

                  {/* Credits count */}
                  {/* The count chip only when the package name doesn't already say it */}
                  {!pkg.name.includes(String(pkg.credits)) && (
                  <div className="mb-3 md:mb-4 md:text-center">
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
                        pkg.popular
                          ? "bg-accent-soft text-accent-ink border border-accent/30"
                          : "bg-primary/5 text-primary border border-primary/10"
                      }`}
                    >
                      <Gem className="h-3.5 w-3.5" />
                      {perRequest
                        ? arabicCount(pkg.credits, { one: "رصيد واحد", two: "رصيدان", few: "أرصدة", many: "رصيداً" })
                        : arabicCount(pkg.credits, { one: "اقتراح واحد", two: "اقتراحان", few: "اقتراحات", many: "اقتراحاً" })}
                    </span>
                  </div>
                  )}

                  {/* Price (money typography): large digits, the currency smaller and muted, the opening offer's old price
                      struck through with the saving; the dollars charged as a muted line */}
                  <div className="mb-1 md:text-center">
                    {(() => {
                      const off = discountPercent({ price: pkg.price, wasPrice: pkg.wasPrice });
                      return off ? (
                        <div className="mb-1 flex items-center gap-2 md:justify-center">
                          <span className="text-label tabular-nums text-muted-ink line-through decoration-destructive/70 decoration-2">
                            {pkg.wasPrice} {currencySymbol(pkg)}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold tabular-nums text-emerald-800">
                            وفّر {off}%
                          </span>
                        </div>
                      ) : null;
                    })()}
                    <MoneyAmount amount={pkg.price} symbol={currencySymbol(pkg)} />
                  </div>

                  {/* Per credit, and the saving against the smallest package (owner request 2026-11-05) */}
                  <p className="text-caption tabular-nums text-muted-ink md:text-center">
                    {(pkg.price / pkg.credits).toFixed(2)} {currencySymbol(pkg)} لكل رصيد
                    {(() => {
                      const save = savingVsSmallest(pkg, packages);
                      return save > 0 ? <span className="ms-1.5 font-bold text-emerald-700">· الرصيد أرخص {save}٪</span> : null;
                    })()}
                  </p>
                  {pkg.chargeUsd ? <UsdLine usd={pkg.chargeUsd} className="mt-0.5 md:text-center" /> : null}
                  <div className="mb-4 md:mb-6" />

                  {/* Features */}
                  <div className="mb-6 hidden space-y-2.5 md:block">
                    {features.map((feat, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 text-sm text-muted-foreground"
                      >
                        <div
                          className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                            pkg.popular
                              ? "bg-accent/15 text-accent-foreground"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                        {feat}
                      </div>
                    ))}
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                      <div
                        className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          pkg.popular
                            ? "bg-accent/15 text-accent-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        <Shield className="h-3 w-3" />
                      </div>
                      دفع آمن ومشفر
                    </div>
                  </div>

                  {/* CTA Button */}
                  <Button
                    size="cta"
                    // Navy on every pack: gold fills belong on navy surfaces only (P2-4 / DS-18)
                    className="w-full rounded-xl text-base font-bold"
                    onClick={() => handlePurchase(pkg.id, pkg.name)}
                    disabled={purchasing !== null || !purchasesEnabled}
                    // The package in the name: three «شراء الآن» on one page (QA PA-L2)
                    aria-label={purchasesEnabled ? `شراء الآن: ${pkg.name}` : undefined}
                  >
                    {purchasing === pkg.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : purchasesEnabled ? (
                      <>
                        <TrendingUp className="h-5 w-5 me-2" />
                        شراء الآن
                      </>
                    ) : (
                      // Saudi prices not approved yet: the button says why it is off (QA WP2-14)
                      "غير متاح حالياً"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {country.code === "JO" && jodCharging ? JO_JOD_NOTE : PRICE_NOTE[country.code]} ·{" "}
        <Link href="/refund-policy" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          سياسة الاسترداد
        </Link>
      </p>

      {/* No payments yet: the wallet drawing (no faces) */}
      {!histFailed && payments.length === 0 && (
        <EmptyState art="wallet" title="لا مدفوعات بعد" description="تظهر هنا كل عملية شراء للرصيد أو اشتراك Pro." />
      )}

      {/* Payment History */}
      {(payments.length > 0 || histFailed) && (
        <div className="space-y-5">
          <div
            className="flex items-center gap-3"
            style={{ animation: "fadeSlideIn 0.5s ease-out 0.5s both" }}
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center border border-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                سجل المدفوعات
              </h2>
              <p className="text-xs text-muted-foreground">
                كل عمليات الدفع السابقة
              </p>
            </div>
          </div>

          {histFailed ? (
            // Only this section: the balance and the packages above stay on screen
            <LoadError
              message="تعذّر تحميل سجل المدفوعات. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
              onRetry={() => loadHistory(histPageRef.current)}
              className="py-6"
            />
          ) : (
          <div className="space-y-3">
            {payments.map((p, index) => {
              const isCompleted = p.status === "COMPLETED";
              const isFailed = p.status === "FAILED";
              const isPending = p.status === "PENDING";
              const isRefunded = p.status === "REFUNDED";

              return (
                <div
                  key={p.id}
                  style={{
                    animation: `fadeSlideIn 0.4s ease-out ${0.55 + index * 0.07}s both`,
                  }}
                >
                  <Card className="group overflow-hidden border-border/40 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5">
                    <div className="flex">
                      <div
                        className={`w-1 flex-shrink-0 ${
                          isCompleted
                            ? "bg-emerald-500"
                            : isFailed
                              ? "bg-destructive/70"
                              : isRefunded
                                ? "bg-muted-foreground/40"
                                : "bg-accent"
                        }`}
                      />
                      <CardContent className="flex-1 flex items-center justify-between py-4 px-5">
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isCompleted
                                ? "bg-emerald-500/10"
                                : isFailed
                                  ? "bg-destructive/10"
                                  : isRefunded
                                    ? "bg-muted"
                                    : "bg-accent/10"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : isFailed ? (
                              <XCircle className="h-5 w-5 text-destructive/70" />
                            ) : isRefunded ? (
                              <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Clock className="h-5 w-5 text-accent-ink" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {p.description}
                            </p>
                            <span className="text-caption text-muted-foreground">
                              {formatDate(p.createdAt, country.code, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <MoneyAmount amount={p.amount} symbol={currencyLabel(p.currency)} size="sm" />
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                isCompleted
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : isFailed
                                    ? "bg-destructive/10 text-destructive"
                                    : isRefunded
                                      ? "bg-muted text-muted-foreground"
                                      : "bg-accent/10 text-accent-foreground"
                              }`}
                            >
                              {isCompleted ? (
                                <>
                                  <CircleDollarSign className="h-3 w-3" />
                                  مكتمل
                                </>
                              ) : isFailed ? (
                                <>
                                  <XCircle className="h-3 w-3" />
                                  لم يكتمل
                                </>
                              ) : isRefunded ? (
                                <>
                                  <ArrowRight className="h-3 w-3" />
                                  مُسترد
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3 w-3" />
                                  قيد المعالجة
                                </>
                              )}
                            </span>
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleCancelPayment(p.id)}
                                disabled={cancellingId === p.id}
                                className="-my-3 inline-flex min-h-11 items-center gap-1 px-2 text-xs text-destructive hover:text-destructive font-semibold transition-colors disabled:opacity-60"
                              >
                                {cancellingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                إلغاء
                              </button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
          )}
          {histTotalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={histPage <= 1} onClick={() => { const p = histPage - 1; histPageRef.current = p; setHistPage(p); loadHistory(p); }}>
                <ChevronRight className="h-4 w-4 me-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {histPage} من {histTotalPages}
              </span>
              <Button variant="outline" size="sm" disabled={histPage >= histTotalPages} onClick={() => { const p = histPage + 1; histPageRef.current = p; setHistPage(p); loadHistory(p); }}>
                التالي
                <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}
      </>)}

      {/* Inline keyframes style */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
