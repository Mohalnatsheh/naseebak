"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  Star,
  Sparkles,
  Receipt,
  Clock,
  ArrowUpRight,
  Gem,
  CircleDollarSign,
  Coins,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-amber-200/30 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</p>
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [matchCredits, setMatchCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [isMale, setIsMale] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "info"; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [plansRes, histRes, profileRes] = await Promise.all([
        fetch("/api/payments/plans"),
        fetch("/api/payments/history"),
        fetch("/api/profile"),
      ]);
      const plansData = await plansRes.json();
      const histData = await histRes.json();
      const profileData = await profileRes.json();

      if (profileData.user?.gender === "MALE") {
        setIsMale(true);
        return;
      }
      setIsMale(false);

      setPackages(plansData.packages || []);
      setPayments(histData.payments || []);
      setMatchCredits(histData.matchCredits ?? 0);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await loadData();
      setLoading(false);
    }
    init();
  }, [loadData]);

  // Handle Stripe redirect success/cancel params
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setToast({ type: "success", message: "تم الدفع بنجاح! تمت إضافة الرصيد" });
      // Refresh data to pick up webhook-credited balance
      loadData();
      // Clean URL params
      router.replace("/dashboard/payments");
    } else if (searchParams.get("cancelled") === "true") {
      setToast({ type: "info", message: "تم إلغاء عملية الدفع" });
      router.replace("/dashboard/payments");
    }
  }, [searchParams, loadData, router]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handlePurchase(packageId: string) {
    setPurchasing(packageId);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const result = await res.json();
      if (res.ok && result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
        return;
      }
      console.error("Checkout failed:", result.error);
    } catch (err) {
      console.error(err);
    } finally {
      setPurchasing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-amber-200/30 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</p>
      </div>
    );
  }

  // Redirect males
  if (isMale) {
    router.replace("/dashboard");
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-8">
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg border backdrop-blur-sm transition-all duration-300 ${
            toast.type === "success"
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-800"
              : "bg-amber-50/95 border-amber-200 text-amber-800"
          }`}
          style={{ animation: "fadeSlideIn 0.3s ease-out" }}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-amber-50/80 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-amber-100/40 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-primary flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Coins className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-amber-600 bg-clip-text text-transparent">
                رصيد التوافقات
              </h1>
            </div>
            <p className="text-muted-foreground text-sm md:text-base">
              اشتري رصيد لرؤية تفاصيل التوافقات المتبادلة
            </p>
          </div>

          {/* Current balance */}
          <div className="flex-shrink-0 bg-card/80 backdrop-blur-sm rounded-xl border border-amber-200/50 p-4 min-w-[160px]">
            <p className="text-xs text-muted-foreground mb-1">رصيدك الحالي</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black bg-gradient-to-l from-amber-500 to-primary bg-clip-text text-transparent">
                {matchCredits}
              </span>
              <span className="text-sm text-muted-foreground font-medium">رصيد</span>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Packages */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {packages.map((pkg, index) => (
          <div
            key={pkg.id}
            style={{
              animation: `fadeSlideIn 0.5s ease-out ${index * 0.12}s both`,
            }}
          >
            <Card
              className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${
                pkg.popular
                  ? "border-amber-300/70 hover:border-amber-400 shadow-xl shadow-amber-500/10 hover:shadow-amber-500/20 scale-[1.02] md:scale-105"
                  : "border-border/50 hover:border-primary/30 hover:shadow-primary/5"
              }`}
            >
              {/* Gradient top strip */}
              <div
                className={`h-2 bg-gradient-to-l ${
                  pkg.popular
                    ? "from-amber-400 via-yellow-500 to-orange-500"
                    : "from-primary to-blue-500"
                }`}
              />

              {/* Popular badge */}
              {pkg.popular && (
                <div className="absolute -top-0 left-1/2 -translate-x-1/2 translate-y-3 z-10">
                  <div className="flex items-center gap-1.5 bg-gradient-to-l from-amber-500 via-yellow-500 to-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-amber-500/30">
                    <Star className="h-3.5 w-3.5 fill-white" />
                    الأفضل قيمة
                  </div>
                </div>
              )}

              {pkg.popular && (
                <>
                  <div className="absolute top-10 right-0 w-24 h-24 bg-amber-200/20 rounded-full translate-x-8 blur-2xl" />
                  <div className="absolute bottom-10 left-0 w-20 h-20 bg-orange-200/20 rounded-full -translate-x-8 blur-2xl" />
                </>
              )}

              <CardContent className={`relative p-6 ${pkg.popular ? "pt-10" : "pt-6"}`}>
                {/* Credits count */}
                <div className="flex justify-center mb-4">
                  <div
                    className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${
                      pkg.popular
                        ? "from-amber-400 via-yellow-500 to-orange-500 shadow-amber-500/30"
                        : "from-primary to-blue-500 shadow-primary/20"
                    } flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Gem className="h-7 w-7 text-white" />
                  </div>
                </div>

                <h3 className="text-center font-bold text-lg mb-3">{pkg.name}</h3>

                {/* Price */}
                <div className="text-center mb-1">
                  <div className="flex items-baseline justify-center gap-1">
                    <span
                      className={`text-4xl font-black bg-gradient-to-l ${
                        pkg.popular
                          ? "from-amber-400 via-yellow-500 to-orange-500"
                          : "from-primary to-blue-500"
                      } bg-clip-text text-transparent`}
                    >
                      {pkg.price}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">
                      د.أ
                    </span>
                  </div>
                </div>

                {/* Per credit price */}
                <p className="text-center text-xs text-muted-foreground mb-5">
                  {(pkg.price / pkg.credits).toFixed(2)} د.أ لكل رصيد
                </p>

                {/* Credits highlight */}
                <div
                  className={`text-center rounded-xl py-2.5 px-3 mb-5 ${
                    pkg.popular
                      ? "bg-amber-50 border border-amber-200/60"
                      : "bg-blue-50 border border-blue-200/60"
                  }`}
                >
                  <span
                    className={`text-sm font-bold ${
                      pkg.popular ? "text-amber-700" : "text-blue-600"
                    }`}
                  >
                    {pkg.credits} رصيد توافق
                  </span>
                </div>

                {/* CTA Button */}
                <Button
                  className={`w-full h-12 rounded-xl font-bold text-base transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] ${
                    pkg.popular
                      ? "bg-gradient-to-l from-amber-500 via-yellow-500 to-orange-500 hover:from-amber-600 hover:via-yellow-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 border-0"
                      : "bg-gradient-to-l from-primary to-blue-500 hover:from-primary/90 hover:to-blue-600 text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 border-0"
                  }`}
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing === pkg.id}
                >
                  {purchasing === pkg.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ArrowUpRight className="h-5 w-5 me-2" />
                      شراء الآن
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="space-y-5">
          <div
            className="flex items-center gap-3"
            style={{ animation: "fadeSlideIn 0.5s ease-out 0.4s both" }}
          >
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
              سجل المدفوعات
            </h2>
          </div>

          <div className="space-y-3">
            {payments.map((p, index) => {
              const isCompleted = p.status === "COMPLETED";

              return (
                <div
                  key={p.id}
                  style={{
                    animation: `fadeSlideIn 0.5s ease-out ${0.5 + index * 0.08}s both`,
                  }}
                >
                  <Card className="group overflow-hidden border-border/50 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-0.5">
                    <div className="flex">
                      <div
                        className={`w-1.5 flex-shrink-0 ${
                          isCompleted
                            ? "bg-gradient-to-b from-emerald-400 to-emerald-600"
                            : "bg-gradient-to-b from-amber-400 to-amber-600"
                        }`}
                      />
                      <CardContent className="flex-1 flex items-center justify-between py-4 px-5">
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isCompleted
                                ? "bg-emerald-50 border border-emerald-200/50"
                                : "bg-amber-50 border border-amber-200/50"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-amber-500" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {p.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center text-[11px] text-muted-foreground bg-muted/60 border border-border/50 rounded-md px-2 py-0.5">
                                {new Date(p.createdAt).toLocaleDateString("ar-JO")}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`text-lg font-black bg-gradient-to-l ${
                              isCompleted
                                ? "from-emerald-500 to-emerald-700"
                                : "from-amber-500 to-amber-700"
                            } bg-clip-text text-transparent`}
                          >
                            {p.amount}{" "}
                            <span className="text-xs font-semibold">{p.currency}</span>
                          </span>
                          <Badge
                            className={`text-[10px] px-2.5 py-0.5 font-semibold border ${
                              isCompleted
                                ? "bg-gradient-to-l from-emerald-100 to-emerald-50 text-emerald-700 border-emerald-200/60"
                                : "bg-gradient-to-l from-amber-100 to-amber-50 text-amber-700 border-amber-200/60"
                            }`}
                          >
                            {isCompleted ? (
                              <>
                                <CircleDollarSign className="h-3 w-3 me-1" />
                                مكتمل
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 me-1" />
                                قيد المعالجة
                              </>
                            )}
                          </Badge>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
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
