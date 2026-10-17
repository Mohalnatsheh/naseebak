"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  popular?: boolean;
}

interface PaymentRecord {
  id: string;
  amount: string;
  currency: string;
  status: string;
  description: string;
  createdAt: string;
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">
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
  // New cycle: a credit is spent per family/chat request, suggestions are free;
  // credit on interest: a credit is spent on "مهتم" instead, requests are free
  const { counts: { flags }, refreshUnread, refreshProfile } = useDashboardData();
  const perRequest = flags.introRequests;
  const creditOnInterest = !!flags.creditOnInterest;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [matchCredits, setMatchCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const [histTotalPages, setHistTotalPages] = useState(1);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  // Embedded checkout state
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutPackageName, setCheckoutPackageName] = useState<string>("");

  const loadData = useCallback(async (p = histPage) => {
    try {
      const [plansRes, histRes] = await Promise.all([
        fetch("/api/payments/plans"),
        fetch(`/api/payments/history?page=${p}`),
      ]);
      const plansData = await plansRes.json();
      const histData = await histRes.json();

      setPackages(plansData.packages || []);
      setPayments(histData.payments || []);
      setMatchCredits(histData.matchCredits ?? 0);
      setHistTotalPages(histData.totalPages || 1);
    } catch (err) {
      console.error(err);
    }
  }, [histPage]);

  useEffect(() => {
    async function init() {
      await loadData();
      setLoading(false);
    }
    init();
  }, [loadData]);

  // Handle return from embedded checkout
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      fetch(`/api/payments/session-status?session_id=${sessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "complete" && data.paymentStatus === "paid") {
            trackEvent("payment_success", { currency: "JOD" });
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

  async function handlePurchase(packageId: string, packageName: string) {
    setPurchasing(packageId);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const result = await res.json();
      if (res.ok && result.clientSecret) {
        trackEvent("begin_checkout", { currency: "JOD", package_name: packageName });
        setCheckoutSecret(result.clientSecret);
        setCheckoutPackageName(packageName);
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
      setPurchasing(null);
    }
  }

  async function handleCancelPayment(paymentId: string) {
    try {
      await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      setToast({ type: "info", message: "تم إلغاء عملية الدفع" });
      loadData();
    } catch (err) {
      console.error(err);
    }
  }

  function closeCheckout() {
    setCheckoutSecret(null);
    setCheckoutPackageName("");
    fetch("/api/payments/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    loadData();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          جاري التحميل...
        </p>
      </div>
    );
  }

  // Show embedded checkout form
  if (checkoutSecret) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
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

        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-0">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret: checkoutSecret }}
            >
              <EmbeddedCheckout className="min-h-[400px]" />
            </EmbeddedCheckoutProvider>
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
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg border backdrop-blur-sm transition-all duration-300 ${
            toast.type === "success"
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-800"
              : toast.type === "error"
                ? "bg-destructive/5 border-destructive/20 text-destructive"
                : "bg-accent/10 border-accent/30 text-accent-foreground"
          }`}
          style={{ animation: "fadeSlideIn 0.3s ease-out" }}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          ) : toast.type === "error" ? (
            <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
          ) : (
            <Sparkles className="h-5 w-5 text-accent flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div
        className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-primary via-primary/95 to-secondary p-8 md:p-10"
        style={{ animation: "fadeSlideIn 0.6s ease-out both" }}
      >
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-x-32 -translate-y-32 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-accent/[0.08] rounded-full translate-x-16 translate-y-16 blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-white/[0.03] rounded-full blur-2xl" />

        {/* Geometric pattern */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg
            className="w-full h-full"
            viewBox="0 0 400 200"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="paymentPattern"
                x="0"
                y="0"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="20"
                  cy="20"
                  r="8"
                  fill="none"
                  stroke="white"
                  strokeWidth="0.5"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="2"
                  fill="white"
                  opacity="0.5"
                />
              </pattern>
            </defs>
            <rect width="400" height="200" fill="url(#paymentPattern)" />
          </svg>
        </div>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Coins className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                  {perRequest ? "رصيد التعارف" : "رصيد الاقتراحات"}
                </h1>
                <p className="text-white/60 text-sm mt-0.5">
                  {creditOnInterest
                    ? `الاقتراحات مجانية. ${CREDIT_ON_INTEREST_LINE}`
                    : perRequest
                    ? "الاقتراحات مجانية. كل طلب تعارف عائلي أو محادثة يستخدم رصيداً واحداً."
                    : "يمكنك شحن رصيدك لتصلك اقتراحات أكثر"}
                </p>
              </div>
            </div>
          </div>

          {/* Current balance card */}
          <div className="flex-shrink-0 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-5 min-w-[180px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-lg bg-accent/20 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
              </div>
              <p className="text-xs text-white/60 font-medium">رصيدك الحالي</p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white">
                {matchCredits}
              </span>
              <span className="text-sm text-white/50 font-medium">رصيد</span>
            </div>
          </div>
        </div>
      </div>

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
                className={`group relative overflow-hidden transition-all duration-500 hover:-translate-y-2 ${
                  pkg.popular
                    ? "border-accent/50 shadow-2xl shadow-accent/15 hover:shadow-accent/25 ring-1 ring-accent/20"
                    : "border-border/40 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
                }`}
              >
                {/* Top accent line */}
                <div
                  className={`h-1.5 ${
                    pkg.popular
                      ? "bg-gradient-to-l from-accent via-accent/80 to-accent/60"
                      : "bg-gradient-to-l from-primary via-secondary to-primary/60"
                  }`}
                />

                {/* Popular badge */}
                {pkg.popular && (
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10">
                    <div className="flex items-center gap-1.5 bg-accent text-accent-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-accent/30">
                      <Crown className="h-3.5 w-3.5" />
                      الأكثر طلباً
                    </div>
                  </div>
                )}

                {/* Background decorations for popular */}
                {pkg.popular && (
                  <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.04] via-transparent to-accent/[0.02] pointer-events-none" />
                )}

                <CardContent
                  className={`relative p-5 md:p-6 ${pkg.popular ? "pt-11 md:pt-12" : "pt-5 md:pt-8"}`}
                >
                  {/* Icon */}
                  <div className="flex justify-center mb-3 md:mb-5">
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
                  <h3 className="text-center font-bold text-lg text-foreground mb-2">
                    {pkg.name}
                  </h3>

                  {/* Credits count */}
                  <div className="text-center mb-4">
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
                        pkg.popular
                          ? "bg-accent/10 text-accent-foreground border border-accent/20"
                          : "bg-primary/5 text-primary border border-primary/10"
                      }`}
                    >
                      <Gem className="h-3.5 w-3.5" />
                      {pkg.credits} {perRequest ? "أرصدة" : "اقتراحات"}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="text-center mb-1">
                    <div className="flex items-baseline justify-center gap-1.5">
                      <span
                        className={`text-4xl md:text-5xl font-black ${
                          pkg.popular ? "text-accent-foreground" : "text-primary"
                        }`}
                      >
                        {pkg.price}
                      </span>
                      <span className="text-base text-muted-foreground font-semibold">
                        د.أ
                      </span>
                    </div>
                  </div>

                  {/* Per credit */}
                  <p className="text-center text-xs text-muted-foreground mb-4 md:mb-6">
                    {(pkg.price / pkg.credits).toFixed(2)} د.أ لكل رصيد
                  </p>

                  {/* Features */}
                  <div className="space-y-2 md:space-y-2.5 mb-5 md:mb-6">
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
                    className={`w-full h-12 rounded-xl font-bold text-base transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-0 ${
                      pkg.popular
                        ? "bg-accent text-accent-foreground shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/35 hover:brightness-110"
                        : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110"
                    }`}
                    onClick={() => handlePurchase(pkg.id, pkg.name)}
                    disabled={purchasing === pkg.id}
                  >
                    {purchasing === pkg.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <TrendingUp className="h-5 w-5 me-2" />
                        شراء الآن
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Payment History */}
      {payments.length > 0 && (
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

          <div className="space-y-3">
            {payments.map((p, index) => {
              const isCompleted = p.status === "COMPLETED";
              const isFailed = p.status === "FAILED";
              const isPending = p.status === "PENDING";

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
                                  : "bg-accent/10"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : isFailed ? (
                              <XCircle className="h-5 w-5 text-destructive/70" />
                            ) : (
                              <Clock className="h-5 w-5 text-accent" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {p.description}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(p.createdAt).toLocaleDateString(
                                "ar-JO-u-nu-latn",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-lg font-bold text-foreground">
                            {p.amount}{" "}
                            <span className="text-xs font-medium text-muted-foreground">
                              {p.currency}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                                isCompleted
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : isFailed
                                    ? "bg-destructive/10 text-destructive"
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
                                  ملغى
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
                                onClick={() => handleCancelPayment(p.id)}
                                className="text-[10px] text-destructive hover:text-destructive font-semibold transition-colors flex items-center gap-0.5"
                              >
                                <X className="h-3 w-3" />
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
          {histTotalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button variant="outline" size="sm" disabled={histPage <= 1} onClick={() => { const p = histPage - 1; setHistPage(p); loadData(p); }}>
                <ChevronRight className="h-4 w-4 me-1" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {histPage} من {histTotalPages}
              </span>
              <Button variant="outline" size="sm" disabled={histPage >= histTotalPages} onClick={() => { const p = histPage + 1; setHistPage(p); loadData(p); }}>
                التالي
                <ChevronLeft className="h-4 w-4 ms-1" />
              </Button>
            </div>
          )}
        </div>
      )}

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
