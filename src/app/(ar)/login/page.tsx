"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { LogIn, Loader2, Shield, HeartHandshake, Sparkles, Send, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePhone } from "@/lib/validations/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import { toLatinDigits } from "@/lib/digits";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { rateLimitedMinutes } from "@/lib/login-limit";
import { arabicCount } from "@/lib/utils";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  /** Wait before another code may be requested (the server also limits 3 per 5 minutes) */
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);
  const [userExists, setUserExists] = useState(false);
  const [showExistsBanner, setShowExistsBanner] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (searchParams.get("exists") === "true") {
      setShowExistsBanner(true);
    }
  }, [searchParams]);

  // Auto-focus OTP input after it's sent
  useEffect(() => {
    if (otpSent) {
      // Small delay to let the input render and animation start
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [otpSent]);

  const phoneRegex = /^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/;

  function validatePhone(): boolean {
    const cleaned = phone.replace(/[\s\-()]/g, "");
    if (!phoneRegex.test(cleaned)) {
      setError("رقم الهاتف غير صالح. الصيغ المقبولة: 07X, 7X, 9627X, +9627X, 009627X");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return false;
    }
    return true;
  }

  async function handleSendOtp() {
    setError("");
    if (resendIn > 0) return;
    if (!validatePhone()) {
      setSendingOtp(false);
      return;
    }
    setSendingOtp(true);
    const normalizedPhone = normalizePhone(phone);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        // Nginx may return HTML on 503 rate limit
        setError("الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return;
      }

      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء إرسال رمز التحقق");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return;
      }

      setOtpSent(true);
      setResendIn(60);
      setUserExists(!!data.userExists);
      trackEvent("otp_requested", { context: "login" });
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // If OTP hasn't been sent yet, send it instead of submitting
    if (!otpSent) {
      handleSendOtp();
      return;
    }

    setError("");
    setLoading(true);

    const normalizedPhone = normalizePhone(phone);

    try {
      // First verify the OTP
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, code: otp }),
      });

      let verifyData;
      try {
        verifyData = await verifyRes.json();
      } catch {
        setError("الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return;
      }

      if (!verifyRes.ok) {
        setError(verifyData.error || "رمز التحقق غير صالح");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return;
      }

      const result = await signIn("credentials", {
        phone: normalizedPhone,
        otp,
        redirect: false,
      });

      if (result?.error) {
        const waitMinutes = rateLimitedMinutes(result.code);
        if (waitMinutes) {
          setError(`محاولات دخول كثيرة غير ناجحة. حاول مرة أخرى بعد ${arabicCount(waitMinutes, { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" })}.`);
          setShake(true);
          setTimeout(() => setShake(false), 600);
          return;
        }
        if (!userExists) {
          // Phone not registered → redirect to register
          // Hand the verified phone + code over privately (never in the URL / analytics)
          try {
            sessionStorage.setItem(
              "naseeb:register-handoff",
              JSON.stringify({ phone: normalizedPhone, otp, at: Date.now() })
            );
          } catch {
            // private mode: the user re-enters the code on the register page
          }
          router.push("/register?from=login");
          return;
        }
        // User exists but login failed (suspended, or the code was used up)
        setError("فشل تسجيل الدخول. قد يكون حسابك معلقاً أو حاول مرة أخرى لاحقاً.");
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return;
      } else {
        trackEvent("login", { method: "phone" });
        // Deep link from a push / shared link opened while signed out (same-site only)
        router.push(safeCallbackPath(searchParams.get("callbackUrl"), window.location.origin));
        router.refresh();
      }
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-row-reverse">
      {/* DECORATIVE PANEL (Right side in RTL) */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] items-center justify-center overflow-hidden">
        {/* Amman at blue hour under the brand blue */}
        <Image src="/images/pages/auth.webp" alt="" fill priority sizes="55vw" className="object-cover" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-bl from-primary/90 via-primary/80 to-primary/65" />

        {/* Animated orbs */}
        <div
          className="absolute top-20 end-20 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl animate-pulse"
          style={{ animationDuration: "8s" }}
        />
        <div
          className="absolute bottom-20 start-10 h-80 w-80 rounded-full bg-accent/[0.06] blur-3xl animate-pulse"
          style={{ animationDuration: "10s" }}
        />
        <div
          className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-secondary/[0.05] blur-3xl animate-pulse"
          style={{ animationDuration: "12s" }}
        />

        {/* Islamic geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="loginPattern"
                x="0"
                y="0"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <polygon
                  points="30,3 37,12 48,12 42,22 46,33 36,30 30,39 24,30 14,33 18,22 12,12 23,12"
                  fill="none"
                  stroke="white"
                  strokeWidth="0.6"
                />
                <polygon
                  points="30,15 35,24 30,33 25,24"
                  fill="none"
                  stroke="white"
                  strokeWidth="0.3"
                />
              </pattern>
            </defs>
            <rect width="400" height="600" fill="url(#loginPattern)" />
          </svg>
        </div>

        {/* Dot pattern */}
        <div className="absolute top-10 start-10 opacity-[0.08]">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <pattern id="logindots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1" fill="white" />
            </pattern>
            <rect width="120" height="120" fill="url(#logindots)" />
          </svg>
        </div>
        <div className="absolute bottom-10 end-10 opacity-[0.08]">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <pattern id="logindots2" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="0.8" fill="white" />
            </pattern>
            <rect width="100" height="100" fill="url(#logindots2)" />
          </svg>
        </div>

        {/* Floating decorative elements */}
        <div
          className="absolute top-[15%] end-[15%] w-16 h-16 rounded-2xl border border-white/10 backdrop-blur-sm bg-white/[0.03] rotate-12"
          style={{ animation: "floatSlow 8s ease-in-out infinite alternate" }}
        />
        <div
          className="absolute bottom-[20%] start-[10%] w-12 h-12 rounded-full border border-white/10 backdrop-blur-sm bg-white/[0.03]"
          style={{ animation: "floatSlow 6s ease-in-out 1s infinite alternate" }}
        />
        <div
          className="absolute top-[60%] end-[8%] w-10 h-10 rounded-xl border border-white/10 backdrop-blur-sm bg-white/[0.03] -rotate-12"
          style={{ animation: "floatSlow 7s ease-in-out 2s infinite alternate" }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center text-primary-foreground px-12">
          {/* Brand name */}
          <div
            className="mb-8"
            style={{ animation: "fadeSlideDown 1s ease-out 0.2s both" }}
          >
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
              <HeartHandshake className="size-10 opacity-90" />
            </div>
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={320}
              height={140}
              className="h-32 xl:h-40 w-auto mx-auto brightness-0 invert"
            />
          </div>

          {/* Tagline */}
          <p
            className="max-w-sm text-xl leading-relaxed opacity-85 font-medium"
            style={{ animation: "fadeSlideUp 1s ease-out 0.4s both" }}
          >
            نوصّلك بشريك العمر بالحلال
            <br />
            بسترة واحترام
          </p>

          {/* Decorative separator */}
          <div
            className="my-10 h-px w-32 bg-gradient-to-l from-transparent via-white/30 to-transparent"
            style={{ animation: "fadeSlideUp 1s ease-out 0.6s both" }}
          />

          {/* Trust badges */}
          <div
            className="flex flex-col gap-4 text-sm opacity-70"
            style={{ animation: "fadeSlideUp 1s ease-out 0.8s both" }}
          >
            <span className="flex items-center justify-center gap-2">
              <Shield className="size-4" />
              صورك مخفية حتى التوافق المتبادل
            </span>
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="size-4" />
              توافق ذكي ودقيق
            </span>
          </div>
        </div>
      </div>

      {/* FORM PANEL (Left side in RTL) */}
      <div className="relative flex w-full lg:w-1/2 xl:w-[45%] items-center justify-center p-6 sm:p-12">
        {/* Subtle background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-background to-secondary/[0.02]" />

        {/* Decorative blur */}
        <div className="absolute top-10 end-10 h-48 w-48 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute bottom-10 start-10 h-40 w-40 rounded-full bg-secondary/[0.03] blur-3xl" />

        <div className="relative w-full max-w-md">
          {/* Mobile brand (shown only on mobile) */}
          <div
            className="mb-8 text-center lg:hidden"
            style={{
              animation: mounted ? "fadeSlideDown 0.6s ease-out both" : "none",
            }}
          >
            <Link href="/" className="inline-block">
              <Image
                src="/images/logo.svg"
                alt="نصيبك"
                width={160}
                height={70}
                className="h-16 w-auto mx-auto"
              />
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              نوصّلك بشريك العمر بالحلال
            </p>
          </div>

          {/* Login card */}
          <Card
            className={`relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/[0.06] transition-all duration-300 ${
              shake ? "animate-shake" : ""
            }`}
            style={{
              animation: mounted
                ? "fadeSlideUp 0.6s ease-out 0.1s both"
                : "none",
            }}
          >
            {/* Top gradient accent */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-primary via-secondary to-accent" />

            {/* Subtle pattern background */}
            <div
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: `radial-gradient(circle at 80% 20%, oklch(0.39 0.07 249 / 0.5), transparent 50%)`,
              }}
            />

            <CardHeader className="relative text-center space-y-3 pb-2 pt-8">
              {/* Desktop: link back */}
              <Link
                href="/"
                className="hidden lg:inline-block hover:opacity-80 transition-opacity duration-300"
              >
                <Image
                  src="/images/logo.svg"
                  alt="نصيبك"
                  width={140}
                  height={61}
                  className="h-14 w-auto mx-auto"
                />
              </Link>
              <CardTitle className="text-2xl font-bold">
                <h1>تسجيل الدخول</h1>
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                أدخل رقم هاتفك للدخول إلى حسابك
              </CardDescription>
            </CardHeader>

            <CardContent className="relative px-6 sm:px-8 pb-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Exists banner (redirected from register) */}
                {showExistsBanner && (
                  <div
                    className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-primary flex items-center gap-2"
                    style={{ animation: "fadeSlideDown 0.3s ease-out both" }}
                  >
                    <Info className="size-4 shrink-0" />
                    رقم الهاتف مسجل مسبقاً. سجّل دخولك من هنا
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div
                    className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive flex items-center gap-2"
                    style={{ animation: "fadeSlideDown 0.3s ease-out both" }}
                  >
                    <div className="size-2 rounded-full bg-destructive shrink-0" />
                    {error}
                  </div>
                )}

                {/* Phone field */}
                <div
                  className="space-y-2"
                  style={{
                    animation: mounted
                      ? "fadeSlideRight 0.5s ease-out 0.2s both"
                      : "none",
                  }}
                >
                  <Label htmlFor="phone" className="text-sm font-semibold">
                    رقم الهاتف
                  </Label>
                  <div className="relative group">
                    <div dir="ltr" className="absolute left-0 top-0 bottom-0 flex items-center pl-3 pointer-events-none z-10">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <svg width="22" height="16" viewBox="0 0 22 16" className="rounded-sm shadow-sm shrink-0">
                          <rect width="22" height="5.33" fill="#000" />
                          <rect y="5.33" width="22" height="5.33" fill="#fff" />
                          <rect y="10.66" width="22" height="5.34" fill="#007A3D" />
                          <polygon points="0,0 10,8 0,16" fill="#CE1126" />
                          <polygon points="3.6,6.4 4.2,8 3,7 4.4,7 3.2,8" fill="#fff" transform="scale(0.7) translate(1.5,5)" />
                        </svg>
                        <span className="font-medium">+962</span>
                      </span>
                      <span className="mx-2 h-5 w-px bg-border/60" />
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="7XXXXXXXX"
                      value={phone}
                      onChange={(e) => {
                        setPhone(toLatinDigits(e.target.value));
                        if (otpSent) {
                          setOtpSent(false);
                          setOtp("");
                        }
                      }}
                      required
                      dir="ltr"
                      className="text-left h-12 pl-[7.5rem] border-border/60 bg-background/50 backdrop-blur-sm rounded-xl transition-all duration-300 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:shadow-lg focus:shadow-primary/[0.04] hover:border-border"
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-l from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 pointer-events-none" />
                  </div>
                </div>

                {/* Send OTP button */}
                {!otpSent && (
                  <div
                    style={{
                      animation: mounted
                        ? "fadeSlideUp 0.5s ease-out 0.3s both"
                        : "none",
                    }}
                  >
                    <Button
                      type="button"
                      onClick={handleSendOtp}
                      className="w-full h-12 text-base font-semibold bg-gradient-to-l from-primary to-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 transition-all duration-500 hover:scale-[1.01] rounded-xl"
                      disabled={sendingOtp || !phone}
                    >
                      {sendingOtp ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Send className="h-4 w-4" />
                          إرسال رمز التحقق
                        </span>
                      )}
                    </Button>
                  </div>
                )}

                {/* OTP field (shown after send-otp succeeds) */}
                {otpSent && (
                  <>
                    <div
                      className="space-y-2"
                      style={{ animation: "fadeSlideRight 0.5s ease-out both" }}
                    >
                      <Label htmlFor="otp" className="text-sm font-semibold">
                        رمز التحقق
                      </Label>
                      <div className="relative group">
                        <Input
                          ref={otpInputRef}
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          placeholder="000000"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                          required
                          dir="ltr"
                          className="text-center text-lg tracking-[0.3em] font-mono h-12 border-border/60 bg-background/50 backdrop-blur-sm rounded-xl transition-all duration-300 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 focus:shadow-lg focus:shadow-primary/[0.04] hover:border-border"
                        />
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-l from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={resendIn > 0 || sendingOtp}
                        className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors duration-300 font-medium disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                      >
                        {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : "إعادة إرسال رمز التحقق"}
                      </button>
                    </div>

                    {/* Submit button */}
                    <div
                      style={{ animation: "fadeSlideUp 0.5s ease-out 0.1s both" }}
                    >
                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-semibold bg-gradient-to-l from-primary to-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 transition-all duration-500 hover:scale-[1.01] rounded-xl"
                        disabled={loading || otp.length !== 6}
                      >
                        {loading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <LogIn className="h-4 w-4" />
                            تسجيل الدخول
                          </span>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </form>

              {/* Separator */}
              <div className="my-6 flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border" />
                <span className="text-xs text-muted-foreground font-medium px-2">
                  أو
                </span>
                <div className="flex-1 h-px bg-gradient-to-l from-border via-border to-transparent" />
              </div>

              {/* Register link */}
              <p
                className="text-center text-sm text-muted-foreground"
                style={{
                  animation: mounted
                    ? "fadeSlideUp 0.5s ease-out 0.5s both"
                    : "none",
                }}
              >
                ليس لديك حساب؟{" "}
                <Link
                  href="/register"
                  className="text-primary font-semibold hover:text-primary/80 hover:underline transition-colors duration-300"
                >
                  سجّل الآن
                </Link>
              </p>
            </CardContent>
          </Card>

          {/* Footer text */}
          <p
            className="mt-8 px-4 text-center text-xs leading-relaxed text-muted-foreground/60 text-balance"
            style={{
              animation: mounted
                ? "fadeSlideUp 0.5s ease-out 0.6s both"
                : "none",
            }}
          >
            بتسجيل دخولك فإنك توافق على{" "}
            <Link href="/terms" className="hover:underline text-muted-foreground/80">
              شروط الاستخدام
            </Link>{" "}
            و<Link href="/privacy" className="hover:underline text-muted-foreground/80">
              سياسة الخصوصية
            </Link>
          </p>
        </div>
      </div>

      {/* Keyframe animations */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideDown {
          from {
            opacity: 0;
            transform: translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideRight {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes floatSlow {
          0% {
            transform: translateY(0px) rotate(var(--tw-rotate, 0deg));
          }
          100% {
            transform: translateY(-20px) rotate(var(--tw-rotate, 0deg));
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out;
        }
      `}</style>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
