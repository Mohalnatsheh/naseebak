"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "@/components/shared/site-link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { LogIn, Loader2, Send, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePhone } from "@/lib/phone";
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
import { useVisitorCountry } from "@/components/shared/visitor-country";
import { DialCodeToggle } from "@/components/shared/dial-code-toggle";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { publicCopy } from "@/lib/public-copy";
import { dialCountryFor, isPhoneFor, phoneFormatsError, phoneWord } from "@/lib/phone-field";
import { AuthShell, AuthCardRule } from "@/components/shared/auth-shell";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  /** Dial-code toggle (🇯🇴 +962 / 🇸🇦 +966), preselected from the visitor's country */
  const visitorCountry = useVisitorCountry();
  const { tagline } = publicCopy(visitorCountry);
  const [country, setCountry] = useState<CountryCode>(visitorCountry);
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
  const [otpByWhatsapp, setOtpByWhatsapp] = useState(false);
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

  function validatePhone(): boolean {
    if (!isPhoneFor(phone, country)) {
      setError(phoneFormatsError(country));
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
    const normalizedPhone = normalizePhone(phone, country);

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
        setError("الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.");
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
      setOtpByWhatsapp(data.channel === "whatsapp");
      trackEvent("otp_requested", { context: "login" });
    } catch {
      setError("حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setSendingOtp(false);
    }
  }

  /** Phone not registered: hand the verified phone + code to the register page privately (never in the URL / analytics) */
  function goToRegister(normalizedPhone: string) {
    try {
      sessionStorage.setItem("naseeb:register-handoff", JSON.stringify({ phone: normalizedPhone, otp, at: Date.now() }));
    } catch {
      // private mode: the user re-enters the code on the register page
    }
    router.push("/register?from=login");
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

    const normalizedPhone = normalizePhone(phone, country);

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
        setError("الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.");
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
      // Known only now that the code is verified (send-otp's answer isn't used: it will be removed)
      const knownMember = !!verifyData.userExists;
      if (!knownMember) {
        goToRegister(normalizedPhone);
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
          setError(`محاولات دخول كثيرة غير ناجحة. يمكنك المحاولة مرة أخرى بعد ${arabicCount(waitMinutes, { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" })}.`);
          setShake(true);
          setTimeout(() => setShake(false), 600);
          return;
        }
        // User exists but login failed (suspended, or the code was used up)
        setError("فشل تسجيل الدخول. قد يكون حسابك معلقاً، أو يمكنك المحاولة مرة أخرى لاحقاً.");
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
      setError("حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell tagline={tagline}>
          {/* Mobile brand (shown only on mobile) */}
          <div
            className="mb-8 text-center lg:hidden"
            style={{
              animation: mounted ? "fadeSlideDown var(--motion-sheet) var(--motion-ease) both" : "none",
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
              {tagline}
            </p>
          </div>

          {/* Login card */}
          <Card
            className={`relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/[0.06] transition-all duration-300 ${
              shake ? "animate-shake" : ""
            }`}
            style={{
              animation: mounted
                ? "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.1s both"
                : "none",
            }}
          >
            <AuthCardRule />

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
                أدخل رقم {COUNTRIES[country].words.phone}ك للدخول إلى حسابك
              </CardDescription>
            </CardHeader>

            <CardContent className="relative px-6 sm:px-8 pb-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Exists banner (redirected from register) */}
                {showExistsBanner && (
                  <div
                    className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-primary flex items-center gap-2"
                    style={{ animation: "fadeSlideDown var(--motion-appear) var(--motion-ease) both" }}
                  >
                    <Info className="size-4 shrink-0" />
                    رقم {phoneWord(country)} مسجل مسبقاً. يمكنك تسجيل الدخول من هنا
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div
                    id="login-error"
                    role="alert"
                    className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive flex items-center gap-2"
                    style={{ animation: "fadeSlideDown var(--motion-appear) var(--motion-ease) both" }}
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
                      ? "fadeSlideRight var(--motion-sheet) var(--motion-ease) 0.2s both"
                      : "none",
                  }}
                >
                  <Label htmlFor="phone" className="text-sm font-semibold">
                    رقم {phoneWord(country)}
                  </Label>
                  <div className="relative group">
                    <div dir="ltr" className="absolute left-0 top-0 bottom-0 flex items-center pl-1.5 z-10">
                      <DialCodeToggle
                        country={country}
                        onChange={(c) => {
                          setCountry(c);
                          if (otpSent) {
                            setOtpSent(false);
                            setOtp("");
                          }
                        }}
                      />
                      <span className="mx-1.5 h-5 w-px bg-border/60 pointer-events-none" />
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      // The error names this field until the code is sent (QA PA-L9)
                      aria-invalid={!!error && !otpSent}
                      aria-describedby={error && !otpSent ? "login-error" : undefined}
                      placeholder={COUNTRIES[country].phone.placeholder}
                      value={phone}
                      onChange={(e) => {
                        const v = toLatinDigits(e.target.value);
                        setPhone(v);
                        // A full number of the other country switches the dial code to it
                        setCountry((c) => dialCountryFor(v, c));
                        if (otpSent) {
                          setOtpSent(false);
                          setOtp("");
                        }
                      }}
                      required
                      dir="ltr"
                      className="text-left h-12 pl-[7.5rem] border-border/60 bg-background/50 backdrop-blur-sm rounded-xl transition-all duration-300 focus:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:shadow-lg focus:shadow-primary/[0.04] hover:border-border"
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-l from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 pointer-events-none" />
                  </div>
                </div>

                {/* Send OTP button */}
                {!otpSent && (
                  <div
                    style={{
                      animation: mounted
                        ? "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.3s both"
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
                      style={{ animation: "fadeSlideRight var(--motion-sheet) var(--motion-ease) both" }}
                    >
                      <Label htmlFor="otp" className="text-sm font-semibold">
                        رمز التحقق
                      </Label>
                      {otpByWhatsapp && <p className="text-xs text-muted-foreground">أرسلنا الرمز عبر واتساب إلى رقمك.</p>}
                      <div className="relative group">
                        <Input
                          ref={otpInputRef}
                          id="otp"
                          type="text"
                          aria-invalid={!!error && otpSent}
                          aria-describedby={error && otpSent ? "login-error" : undefined}
                          inputMode="numeric"
                          placeholder="000000"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                          required
                          dir="ltr"
                          className="text-center text-lg tracking-[0.3em] font-mono h-12 border-border/60 bg-background/50 backdrop-blur-sm rounded-xl transition-all duration-300 focus:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:shadow-lg focus:shadow-primary/[0.04] hover:border-border"
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
                      style={{ animation: "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.1s both" }}
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
                    ? "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.5s both"
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
            className="mt-8 px-4 text-center text-xs leading-relaxed text-muted-foreground text-balance"
            style={{
              animation: mounted
                ? "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.6s both"
                : "none",
            }}
          >
            بتسجيل دخولك فإنك توافق على{" "}
            <Link href="/terms" className="hover:underline text-muted-foreground">
              شروط الاستخدام
            </Link>{" "}
            و<Link href="/privacy" className="hover:underline text-muted-foreground">
              سياسة الخصوصية
            </Link>
          </p>
    </AuthShell>
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
