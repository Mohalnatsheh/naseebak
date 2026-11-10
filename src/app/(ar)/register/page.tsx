"use client";

import { compressImage } from "@/lib/image-compress";
import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import Link from "@/components/shared/site-link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  UserPlus,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Shield,
  Camera,
  Send,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { normalizePhone, localPhone, arabicLetterCount, isArabicName, NAME_MAX_LENGTH, TERMS_REQUIRED_MESSAGE } from "@/lib/phone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trackEvent, trackMetaEvent } from "@/lib/analytics";
import { toLatinDigits } from "@/lib/digits";
import { takeLandingStart } from "@/lib/landing-start";
import { useVisitorCountry } from "@/components/shared/visitor-country";
import { DialCodeToggle } from "@/components/shared/dial-code-toggle";
import { TermsConsentText } from "@/components/shared/terms-consent-text";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { dialCountryFor, isPhoneFor, phoneExampleError, phoneFormatsError, phoneWord } from "@/lib/phone-field";

/** Seconds before another verification code may be requested (the server also limits 3 per 5 minutes) */
const RESEND_SECONDS = 60;

/* ------------------------------------------------------------------ */
/*  Sparkle / confetti CSS-only particles                             */
/* ------------------------------------------------------------------ */
function Sparkles() {
  // Random positions are picked once per mount (lazy initial state), never on re-render
  const [particles] = useState(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 1.8 + Math.random() * 1.5,
        size: 4 + Math.random() * 6,
        // Brand palette: deep blue + warm gold
        color: ["#22476a", "#c19250", "#2b5a84", "#c19250", "#22476a", "#15304a"][Math.floor(Math.random() * 6)],
      }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full animate-[confetti_var(--dur)_ease-out_var(--delay)_forwards] opacity-0"
          style={
            {
              left: `${p.x}%`,
              top: "50%",
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              "--delay": `${p.delay}s`,
              "--dur": `${p.duration}s`,
            } as React.CSSProperties
          }
        />
      ))}
      <style>{`
        @keyframes confetti {
          0% { opacity: 0; transform: translateY(0) rotate(0deg) scale(0); }
          15% { opacity: 1; transform: translateY(-40px) rotate(60deg) scale(1); }
          100% { opacity: 0; transform: translateY(-220px) translateX(var(--x, 30px)) rotate(360deg) scale(0.3); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated check circle (success step)                              */
/* ------------------------------------------------------------------ */
function AnimatedCheck() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute h-28 w-28 rounded-full bg-primary/20 animate-ping" />
      <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30">
        <svg
          viewBox="0 0 24 24"
          className="h-12 w-12 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M5 13l4 4L19 7"
            className="animate-[drawCheck_0.6s_ease-out_0.4s_forwards]"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 24,
            }}
          />
        </svg>
      </div>
      <style>{`
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */
function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);

  /* Registration open/closed status */
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [statusChecking, setStatusChecking] = useState(true);
  const [newCycle, setNewCycle] = useState(false);
  /** Confirmation after a code is sent, and the wait before another one may be requested */
  const [otpNotice, setOtpNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    fetch("/api/settings/registration-status")
      .then((res) => res.json())
      .then((data) => {
        if (data.registrationOpen === false) {
          setRegistrationClosed(true);
        }
        setNewCycle(data.newCycle === true);
      })
      .catch(() => {
        // Fail-open: if status check fails, allow registration
      })
      .finally(() => setStatusChecking(false));
  }, []);

  /* Slide animation direction */
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const [animating, setAnimating] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    gender: "" as "MALE" | "FEMALE" | "",
    otp: "",
    referralCode: "",
  });
  /** Dial-code toggle (🇯🇴 +962 / 🇸🇦 +966), preselected from the visitor's country; the account's
   *  country is then taken from the number on the server */
  const visitorCountry = useVisitorCountry();
  const [country, setCountry] = useState<CountryCode>(visitorCountry);
  /** One required tick: terms + privacy policy + 18 or older (stored as User.termsAcceptedAt) */
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Track if OTP was already verified (e.g. redirected from login)
  const [otpAlreadyVerified, setOtpAlreadyVerified] = useState(false);

  // Arrived from sign-in with a number that has no account (QA WA-07): say why this page opened
  const [fromLogin, setFromLogin] = useState(false);
  // «حساب جديد» with a number that already has an account: signed in to it, and told so (QA WA-17)
  const [existingAccount, setExistingAccount] = useState(false);
  // The number already had an account: the notice comes into view and takes the focus, and the form is done (QA WM-15)
  const existingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!existingAccount) return;
    existingRef.current?.scrollIntoView({ block: "center" });
    existingRef.current?.focus({ preventScroll: true });
  }, [existingAccount]);

  // Toggle for referral code input
  const [showReferral, setShowReferral] = useState(false);

  // Pre-fill phone + OTP from URL params (e.g. redirected from login after OTP verification)
  // Also read invitationCode from URL params for referral
  useEffect(() => {
    // Verified phone + code handed over by the login page (kept out of the URL; valid 10 minutes)
    try {
      const raw = sessionStorage.getItem("naseeb:register-handoff");
      if (raw) {
        sessionStorage.removeItem("naseeb:register-handoff");
        const handoff = JSON.parse(raw) as { phone?: string; otp?: string; at?: number };
        if (handoff.phone && handoff.otp && Date.now() - (handoff.at ?? 0) < 10 * 60 * 1000) {
          // The field sits next to its +962 / +966 dial code: show the number as typed at home (QA WA-07)
          const dial = dialCountryFor(handoff.phone, visitorCountry);
          setForm((prev) => ({ ...prev, phone: localPhone(handoff.phone!, dial), otp: handoff.otp! }));
          setCountry(dial);
          setOtpSent(true);
          setOtpAlreadyVerified(true);
          setFromLogin(searchParams.get("from") === "login");
        }
      }
    } catch {
      // ignore a malformed handoff
    }

    // «أبحث عن زوجة / زوج» (+ an optional phone) from the landing page's quick start
    const start = takeLandingStart(typeof window === "undefined" ? undefined : window.sessionStorage);
    if (start) {
      setForm((prev) => ({ ...prev, gender: start.gender, phone: prev.phone || start.phone }));
      if (start.phone) setCountry((c) => dialCountryFor(start.phone, c));
    }

    const invitationCode = searchParams.get("invitationCode");
    if (invitationCode) {
      setForm((prev) => ({ ...prev, referralCode: invitationCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) }));
      setShowReferral(true);
    }
  }, [searchParams, visitorCountry]);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // The error box sits above the form; on a phone the button is far below it, so bring it into view (QA WA-08)
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error || !errorRef.current) return;
    errorRef.current.scrollIntoView?.({ behavior: "smooth", block: "center" });
    errorRef.current.focus({ preventScroll: true });
  }, [error]);

  // Optional photo
  const [wantsPhoto, setWantsPhoto] = useState(false);
  /** Optional extras that didn't go through (shown on the success screen; the account is fine) */
  const [extraWarnings, setExtraWarnings] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePhotoSelect(file: File | null) {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("حجم الملف يجب أن يكون أقل من 5 ميجابايت");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("يرجى اختيار صورة بصيغة JPG أو PNG أو WebP");
      return;
    }

    setError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  /** Which field the current error is about, so that field says it is invalid and points at the message (QA PA-L9) */
  const errorField: "firstName" | "lastName" | "phone" | "otp" | null = !error
    ? null
    : error.includes("الاسم الأول")
      ? "firstName"
      : error.includes("اسم العائلة")
        ? "lastName"
        : error.includes("رمز")
          ? "otp"
          : error.includes("رقم") || error.includes("الجوال") || error.includes("الهاتف")
            ? "phone"
            : null;
  const fieldError = (id: "firstName" | "lastName" | "phone" | "otp") =>
    errorField === id ? { "aria-invalid": true as const, "aria-describedby": "register-error" } : {};

  /** The names' problem, or null: checked before a code is sent too, not only after it (QA WM-16) */
  function namesError(): string | null {
    if (arabicLetterCount(form.firstName) < 2) return form.firstName.trim() ? "الاسم الأول يجب أن يكون حرفين على الأقل" : "الاسم الأول مطلوب";
    if (!isArabicName(form.firstName)) return "الاسم الأول يجب أن يكون بالعربية فقط، بلا أرقام أو رموز";
    if (arabicLetterCount(form.lastName) < 2) return form.lastName.trim() ? "اسم العائلة يجب أن يكون حرفين على الأقل" : "اسم العائلة مطلوب";
    if (!isArabicName(form.lastName)) return "اسم العائلة يجب أن يكون بالعربية فقط، بلا أرقام أو رموز";
    return null;
  }

  async function handleSendOtp() {
    setError("");
    setOtpNotice("");
    if (resendIn > 0) return;
    const names = namesError();
    if (names) {
      setError(names);
      return;
    }
    // Say what is wrong with the number here, instead of the server's generic "invalid data"
    if (!isPhoneFor(form.phone, country)) {
      setError(phoneExampleError(country));
      return;
    }
    setSendingOtp(true);
    const normalizedPhone = normalizePhone(form.phone, country);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, context: "register" }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError("الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء إرسال رمز التحقق");
        return;
      }

      trackEvent("otp_requested", { context: "register" });

      setOtpSent(true);
      setOtpNotice(`أرسلنا رمز التحقق ${data.channel === "whatsapp" ? "عبر واتساب" : "برسالة نصية"} إلى ${form.phone}`);
      setResendIn(RESEND_SECONDS);
    } catch {
      setError("حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.");
    } finally {
      setSendingOtp(false);
    }
  }

  function validateStep1(): boolean {
    setError("");

    const names = namesError();
    if (names) {
      setError(names);
      return false;
    }
    if (!form.gender) {
      setError("يرجى اختيار الجنس");
      return false;
    }
    if (!form.phone) {
      setError(`يرجى إدخال رقم ${phoneWord(country)}`);
      return false;
    }
    if (!isPhoneFor(form.phone, country)) {
      setError(phoneFormatsError(country));
      return false;
    }
    if (!otpSent) {
      setError("يرجى إرسال رمز التحقق أولاً");
      return false;
    }
    if (!form.otp || form.otp.length !== 6) {
      setError("يرجى إدخال رمز التحقق المكون من 6 أرقام");
      return false;
    }
    if (!termsAccepted) {
      setError(TERMS_REQUIRED_MESSAGE);
      return false;
    }
    return true;
  }

  const goToStep = useCallback(
    (target: number) => {
      setSlideDir(target > step ? "next" : "prev");
      setAnimating(true);
      setTimeout(() => {
        setStep(target);
        setAnimating(false);
      }, 250);
    },
    [step]
  );

  function handleNext() {
    if (step === 1 && !validateStep1()) return;

    if (step === 1) {
      handleSubmit();
      return;
    }

    goToStep(step + 1);
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const normalizedPhone = normalizePhone(form.phone, country);

    try {
      // Step 1: Verify the OTP first (skip if already verified from login redirect)
      if (!otpAlreadyVerified) {
        const verifyRes = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalizedPhone, code: form.otp }),
        });

        let verifyData;
        try {
          verifyData = await verifyRes.json();
        } catch {
          setError("الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.");
          return;
        }

        if (!verifyRes.ok) {
          setError(verifyData.error || "رمز التحقق غير صالح");
          return;
        }
      }

      // Step 2: Register the account
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: normalizedPhone,
          gender: form.gender,
          otp: form.otp,
          termsAccepted,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError("الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.");
        return;
      }

      if (res.status === 409 && data.code === "PHONE_EXISTS") {
        // The number already has an account (send-otp never says so): the verified code signs in
        const existing = await signIn("credentials", { phone: normalizedPhone, otp: form.otp, redirect: false });
        if (existing?.error) {
          window.location.href = "/login?exists=true";
          return;
        }
        // Never silently: the names typed here were not saved (QA WA-17)
        setExistingAccount(true);
        return;
      }

      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء التسجيل");
        return;
      }

      // Step 3: Auto sign in
      const signInResult = await signIn("credentials", {
        phone: normalizedPhone,
        otp: form.otp,
        redirect: false,
      });

      if (signInResult?.error) {
        // The account exists now, so pressing «إنشاء الحساب» again would only fail: send the
        // member to the login page (referral code and photo can be added from the dashboard)
        trackEvent("sign_up", { method: "phone" });
        trackMetaEvent("CompleteRegistration", { site_country: country });
        window.location.href = "/login?exists=true";
        return;
      }
      trackEvent("sign_up", { method: "phone" });
      trackMetaEvent("CompleteRegistration", { site_country: country });

      // Step 3.5: Apply referral code if provided
      const warnings: string[] = [];
      if (form.referralCode && form.referralCode.length === 8) {
        try {
          const res = await fetch("/api/referral/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: form.referralCode }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            warnings.push(`لم يُطبَّق رمز الدعوة: ${data.error ?? "تعذّر التحقق منه"}`);
          }
        } catch {
          warnings.push("لم يُطبَّق رمز الدعوة بسبب مشكلة في الاتصال.");
        }
      }

      // Step 4: Upload optional photo if selected
      if (wantsPhoto && photoFile) {
        try {
          const photoData = await compressImage(photoFile);
          const res = await fetch("/api/profile/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoData, isPrimary: true }),
          });
          if (!res.ok) warnings.push("لم نتمكن من رفع صورتك الآن. يمكنك إضافتها لاحقاً من صفحة «صوري».");
        } catch {
          warnings.push("لم نتمكن من رفع صورتك الآن. يمكنك إضافتها لاحقاً من صفحة «صوري».");
        }
      }
      setExtraWarnings(warnings);

      // Move to success step
      goToStep(2);
    } catch {
      setError("حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Step labels for the wizard                                      */
  /* ---------------------------------------------------------------- */
  const stepLabels = ["معلومات الحساب", "تم بنجاح"];

  /* Loading state while checking registration status (also what the server sends: keep a real heading in it) */
  if (statusChecking) {
    return (
      <main id="main" tabIndex={-1} className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4 overflow-hidden">
        <div className="fixed inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <h1 className="text-xl font-bold text-primary">إنشاء حساب جديد في نصيبك</h1>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  /* Registration closed alert */
  if (registrationClosed) {
    return (
      <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
        <div className="fixed inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <div className="fixed inset-0 -z-10 opacity-40">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        </div>
        <Card className="relative w-full max-w-lg border-white/40 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/5">
          <CardHeader className="text-center space-y-3 pb-2">
            <Link href="/" className="inline-block">
              <Image
                src="/images/logo.svg"
                alt="نصيبك"
                width={160}
                height={70}
                className="h-12 w-auto mx-auto"
              />
            </Link>
          </CardHeader>
          <CardContent className="text-center space-y-6 py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                التسجيل مغلق حالياً
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                عذراً، التسجيل في المنصة مغلق مؤقتاً. نعمل على تحسين خدماتنا وسنفتح التسجيل قريباً إن شاء الله.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/login">
                <Button className="w-full h-11 rounded-xl text-sm font-semibold bg-gradient-to-l from-primary to-primary/90 shadow-md shadow-primary/15">
                  تسجيل الدخول لحساب موجود
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      {/* ---- Background: Amman at blue hour, faint, under the brand gradient ---- */}
      {/* Fades out at its foot, so a long form (or the phone toolbar sliding away) never shows a hard edge (QA DS-07) */}
      <div className="fixed inset-x-0 top-0 -z-20 h-[100lvh] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]" aria-hidden>
        <Image src="/images/pages/auth.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-25" />
      </div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background/80 to-accent/10" />
      <div className="fixed inset-0 -z-10 opacity-40">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/8 blur-3xl" />
      </div>

      {/* ---- Main card with glassmorphism ---- */}
      <Card className="relative w-full max-w-lg border-white/40 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/5">
        <CardHeader className="text-center space-y-3 pb-2">
          <Link href="/" className="inline-block">
            <Image
              src="/images/logo.svg"
              alt="نصيبك"
              width={160}
              height={70}
              className="h-12 w-auto mx-auto"
            />
          </Link>
          <CardTitle className="text-xl font-bold">
            <h1>إنشاء حساب جديد</h1>
          </CardTitle>
          <CardDescription className="text-sm">
            أنشئ حسابك للبدء في رحلة البحث عن شريك الحياة
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* ============================================ */}
          {/*  Fancy step indicator                        */}
          {/* ============================================ */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {stepLabels.map((label, idx) => {
              const stepNum = idx + 1;
              const isCompleted = step > stepNum;
              const isActive = step === stepNum;

              return (
                <div key={idx} className="flex items-center">
                  {/* Circle */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`
                        relative flex h-10 w-10 items-center justify-center rounded-full
                        text-sm font-bold transition-all duration-500
                        ${
                          isCompleted
                            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
                            : isActive
                            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-primary/20"
                            : "bg-muted text-muted-foreground"
                        }
                      `}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        stepNum
                      )}
                      {isActive && (
                        <span className="absolute inset-0 rounded-full animate-[glow_2s_ease-in-out_infinite] bg-primary/20" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap transition-colors duration-300 ${
                        isActive
                          ? "text-primary"
                          : isCompleted
                          ? "text-primary/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {/* Connector line */}
                  {idx < stepLabels.length - 1 && (
                    <div className="relative mx-2 h-0.5 w-12 sm:w-16 rounded-full bg-muted overflow-hidden -mt-5">
                      <div
                        className="absolute inset-y-0 right-0 bg-gradient-to-l from-primary to-primary/80 rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: step > stepNum ? "100%" : "0%",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <style>{`
            @keyframes glow {
              0%, 100% { opacity: 0; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.5); }
            }
          `}</style>

          {/* ============================================ */}
          {/*  Error display                               */}
          {/* ============================================ */}
          {existingAccount && (
            <div ref={existingRef} tabIndex={-1} role="status" className="mb-5 space-y-3 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary outline-none">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                هذا الرقم مسجّل بحساب سابق، وتم تسجيل الدخول إليه. لم يتغيّر الاسم المسجّل في الحساب.
              </p>
              <Button type="button" className="h-11 w-full rounded-xl" onClick={() => { window.location.href = "/dashboard"; }}>
                المتابعة إلى حسابي
              </Button>
            </div>
          )}
          {fromLogin && !existingAccount && (
            <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-sm text-primary">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              لا يوجد حساب بهذا الرقم، يمكنك إنشاء حساب جديد به الآن.
            </div>
          )}
          {error && (
            <div ref={errorRef} id="register-error" tabIndex={-1} role="alert" className="outline-none rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-sm text-destructive mb-5 flex items-center gap-2 animate-[shake_0.4s_ease-in-out]">
              <div className="h-2 w-2 rounded-full bg-destructive shrink-0" />
              {error}
            </div>
          )}
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-6px); }
              40% { transform: translateX(6px); }
              60% { transform: translateX(-4px); }
              80% { transform: translateX(4px); }
            }
          `}</style>

          {/* ============================================ */}
          {/*  Animated step container                     */}
          {/* ============================================ */}
          {/* Signed in to the existing account: nothing left to fill or send here (QA WM-15) */}
          <fieldset disabled={existingAccount} hidden={existingAccount} className="contents">
          <div
            className={`transition-all duration-300 ease-out ${
              animating
                ? slideDir === "next"
                  ? "opacity-0 -translate-x-8"
                  : "opacity-0 translate-x-8"
                : "opacity-100 translate-x-0"
            }`}
          >
            {/* ======================================== */}
            {/*  STEP 1 -- Personal Info + Phone + OTP   */}
            {/* ======================================== */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label
                      htmlFor="firstName"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      الاسم الأول
                    </Label>
                    <Input
                      id="firstName"
                      {...fieldError("firstName")}
                      value={form.firstName}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\u0600-\u06FF\s]/g, "");
                        updateField("firstName", val);
                      }}
                      className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      required
                      maxLength={NAME_MAX_LENGTH}
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="lastName"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      اسم العائلة
                    </Label>
                    <Input
                      id="lastName"
                      {...fieldError("lastName")}
                      value={form.lastName}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\u0600-\u06FF\s]/g, "");
                        updateField("lastName", val);
                      }}
                      className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      required
                      maxLength={NAME_MAX_LENGTH}
                      dir="rtl"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2">
                  يرجى إدخال الاسم باللغة العربية فقط
                </p>

                {/* ---- Gender selection cards ---- */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    الجنس
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Male card */}
                    <button
                      type="button"
                      onClick={() => updateField("gender", "MALE")}
                      className={`group relative rounded-2xl border-2 p-4 text-center transition-all duration-300 overflow-hidden ${
                        form.gender === "MALE"
                          ? "border-transparent bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg shadow-primary/10"
                          : "border-border/60 hover:border-primary/40 hover:shadow-md bg-muted/20"
                      }`}
                    >
                      {form.gender === "MALE" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-secondary opacity-10" />
                      )}
                      {form.gender === "MALE" && (
                        <div
                          className="absolute inset-0 rounded-[14px] m-px"
                          style={{
                            background:
                              "linear-gradient(135deg, var(--primary), var(--secondary))",
                            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                            maskComposite: "xor",
                            WebkitMaskComposite: "xor",
                            padding: "2px",
                          }}
                        />
                      )}
                      <div className="relative">
                        <div
                          className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
                            form.gender === "MALE"
                              ? "bg-gradient-to-br from-primary to-secondary text-white shadow-md"
                              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="10" cy="14" r="5" />
                            <path d="M19 5l-5.4 5.4" />
                            <path d="M15 5h4v4" />
                          </svg>
                        </div>
                        <span
                          className={`text-sm font-bold transition-colors ${
                            form.gender === "MALE"
                              ? "text-primary"
                              : "text-foreground"
                          }`}
                        >
                          ذكر (شاب)
                        </span>
                      </div>
                    </button>
                    {/* Female card */}
                    <button
                      type="button"
                      onClick={() => updateField("gender", "FEMALE")}
                      className={`group relative rounded-2xl border-2 p-4 text-center transition-all duration-300 overflow-hidden ${
                        form.gender === "FEMALE"
                          ? "border-transparent bg-gradient-to-br from-accent/10 to-accent/20 shadow-lg shadow-accent/10"
                          : "border-border/60 hover:border-accent/50 hover:shadow-md bg-muted/20"
                      }`}
                    >
                      {form.gender === "FEMALE" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent to-accent/70 opacity-10" />
                      )}
                      {form.gender === "FEMALE" && (
                        <div
                          className="absolute inset-0 rounded-[14px] m-px"
                          style={{
                            background:
                              "linear-gradient(135deg, var(--accent), var(--primary))",
                            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                            maskComposite: "xor",
                            WebkitMaskComposite: "xor",
                            padding: "2px",
                          }}
                        />
                      )}
                      <div className="relative">
                        <div
                          className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
                            form.gender === "FEMALE"
                              ? "bg-gradient-to-br from-accent to-accent/70 text-white shadow-md"
                              : "bg-muted text-muted-foreground group-hover:bg-accent/15 group-hover:text-accent-foreground"
                          }`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="9" r="5" />
                            <path d="M12 14v7" />
                            <path d="M9 18h6" />
                          </svg>
                        </div>
                        <span
                          className={`text-sm font-bold transition-colors ${
                            form.gender === "FEMALE"
                              ? "text-accent-foreground"
                              : "text-foreground"
                          }`}
                        >
                          أنثى (فتاة)
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* ---- Phone number ---- */}
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    رقم {phoneWord(country)}
                  </Label>
                  <div className="relative">
                    <div dir="ltr" className="absolute left-0 top-0 bottom-0 flex items-center pl-1 z-10">
                      <DialCodeToggle
                        country={country}
                        disabled={otpAlreadyVerified}
                        className="h-11 text-xs"
                        onChange={(c) => {
                          setCountry(c);
                          if (otpSent) {
                            setOtpSent(false);
                            updateField("otp", "");
                          }
                          setOtpAlreadyVerified(false);
                        }}
                      />
                      <span className="mx-1 h-4 w-px bg-border/60 pointer-events-none" />
                    </div>
                    <Input
                      id="phone"
                      {...fieldError("phone")}
                      type="tel"
                      placeholder={COUNTRIES[country].phone.placeholder}
                      value={form.phone}
                      onChange={(e) => {
                        const v = toLatinDigits(e.target.value);
                        updateField("phone", v);
                        // A full number of the other country switches the dial code to it
                        setCountry((c) => dialCountryFor(v, c));
                        if (otpSent) {
                          setOtpSent(false);
                          updateField("otp", "");
                        }
                        // A code verified on the login page belongs to the old number
                        setOtpAlreadyVerified(false);
                      }}
                      dir="ltr"
                      className="h-11 pl-[7rem] rounded-xl border-border/60 bg-muted/30 text-left focus:bg-background transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Send OTP button */}
                {!otpSent && (
                  <Button
                    type="button"
                    onClick={handleSendOtp}
                    className="w-full h-11 rounded-xl text-sm font-semibold bg-gradient-to-l from-primary to-primary/90 shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
                    disabled={sendingOtp || !form.phone}
                  >
                    {sendingOtp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Send className="h-4 w-4" />
                        إرسال رمز التحقق
                      </span>
                    )}
                  </Button>
                )}

                {/* OTP input (shown after send succeeds) */}
                {otpSent && (
                  <div className="space-y-2" style={{ animation: "fadeSlideIn 0.3s ease-out both" }}>
                    <Label
                      htmlFor="otp"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      رمز التحقق
                    </Label>
                    <Input
                      id="otp"
                      {...fieldError("otp")}
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      value={form.otp}
                      onChange={(e) => updateField("otp", toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                      dir="ltr"
                      className="h-11 rounded-xl border-border/60 bg-muted/30 text-center text-lg tracking-[0.3em] font-mono focus:bg-background transition-colors"
                      required
                    />
                    {otpNotice && (
                      <p role="status" className="text-xs text-emerald-700">{otpNotice}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={resendIn > 0 || sendingOtp}
                      className="inline-flex min-h-11 items-center text-xs text-primary hover:text-primary/80 hover:underline transition-colors duration-300 font-medium disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    >
                      {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : "إعادة إرسال رمز التحقق"}
                    </button>
                  </div>
                )}
                <style>{`
                  @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                {/* ---- Privacy note ---- */}
                <div className="flex items-center gap-3 p-3 bg-gradient-to-l from-primary/5 to-primary/[0.03] rounded-xl border border-primary/10 text-sm text-muted-foreground">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <span className="leading-relaxed text-xs">
                    اسمك الكامل ورقم {country === "SA" ? "جوالك" : "هاتفك"} محميان بالكامل ولن يظهرا لأي مستخدم آخر على المنصة. يُعرض فقط الاسم الأول للمستخدمين الآخرين
                  </span>
                </div>

                {/* ---- Referral code (optional, toggled) ---- */}
                {!showReferral ? (
                  <button
                    type="button"
                    onClick={() => setShowReferral(true)}
                    className="inline-flex min-h-11 items-center text-sm text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors duration-300 font-medium"
                  >
                    لديك رمز دعوة؟
                  </button>
                ) : (
                  <div className="space-y-2" style={{ animation: "fadeSlideIn 0.3s ease-out both" }}>
                    <Label
                      htmlFor="referralCode"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      رمز الدعوة <span className="text-muted-foreground">(اختياري)</span>
                    </Label>
                    <Input
                      id="referralCode"
                      type="text"
                      placeholder="XXXXXXXX"
                      maxLength={8}
                      value={form.referralCode}
                      onChange={(e) =>
                        updateField("referralCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))
                      }
                      dir="ltr"
                      className="h-11 rounded-xl border-border/60 bg-muted/30 text-center text-sm tracking-[0.1em] font-mono focus:bg-background transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      إذا دعاك أحد، فأدخل رمز الدعوة هنا
                    </p>
                  </div>
                )}

                {/* ---- Optional photo upload ---- */}
                <div className="space-y-3">
                  {/* The whole row is the 44 px target, not the 18 px switch alone (QA WM-03 / PA-M10) */}
                  <div className="flex min-h-11 items-center gap-3">
                    <Switch
                      id="wants-photo"
                      checked={wantsPhoto}
                      onCheckedChange={setWantsPhoto}
                      className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                    />
                    <Label htmlFor="wants-photo" className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-medium text-foreground/80">
                      أرغب بإضافة صورة شخصية
                    </Label>
                  </div>

                  {wantsPhoto && (
                    <div className="animate-[fadeSlideIn_0.3s_ease-out]">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => handlePhotoSelect(e.target.files?.[0] || null)}
                      />
                      {photoPreview ? (
                        <div className="relative w-32 h-32 mx-auto rounded-2xl overflow-hidden border-2 border-primary/30 shadow-md group">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview of the picked file; next/image cannot optimise blob: URLs */}
                          <img
                            src={photoPreview}
                            alt="صورة شخصية"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-xs font-medium backdrop-blur-sm"
                          >
                            تغيير
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="mx-auto flex flex-col items-center gap-2 w-32 h-32 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 transition-all duration-300 justify-center"
                        >
                          <Camera className="h-8 w-8 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            اضغط للرفع
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ---- Terms, privacy and 18+ (required) ---- */}
                <label htmlFor="terms-accepted" className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 cursor-pointer">
                  <input
                    id="terms-accepted"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary cursor-pointer"
                    required
                  />
                  <TermsConsentText country={country} />
                </label>
              </div>
            )}

            {/* ======================================== */}
            {/*  STEP 2 -- Success                        */}
            {/* ======================================== */}
            {step === 2 && (
              <div className="relative text-center space-y-7 py-8">
                <Sparkles />
                <AnimatedCheck />
                <div className="space-y-3 relative">
                  <h3 className="text-2xl font-extrabold bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
                    تم إنشاء حسابك بنجاح!
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm max-w-xs mx-auto">
                    {form.gender === "FEMALE"
                      ? "ابدئي الآن بإعداد ملفكِ الشخصي ومواصفات الشريك الذي تبحثين عنه."
                      : "ابدأ الآن بإعداد ملفك الشخصي ومواصفات الشريك الذي تبحث عنه."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {newCycle
                      ? "إعداد قصير من 4 خطوات، وبعده تبدأ اقتراحاتك المجانية مباشرة، ومعك رصيد مجاني للتعارف."
                      : "إكمال ملفك الشخصي بنسبة 50% يتيح لك البدء بتلقي اقتراحات التوافق، ومعك رصيد مجاني للبدء"}
                  </p>
                </div>
                {extraWarnings.length > 0 && (
                  <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-start text-xs leading-relaxed text-amber-800">
                    {extraWarnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                )}
                <Button
                  onClick={() => {
                    router.push("/dashboard/profile/setup");
                    router.refresh();
                  }}
                  className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5"
                >
                  {form.gender === "FEMALE" ? "ابدئي إعداد ملفكِ" : "ابدأ إعداد ملفك"}
                  <ArrowLeft className="h-5 w-5 ms-2" />
                </Button>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/*  Navigation buttons                          */}
          {/* ============================================ */}
          {step < 2 && (
            <div className="flex items-center justify-between mt-7 gap-3">
              {step > 1 ? (
                <Button
                  variant="outline"
                  onClick={() => goToStep(step - 1)}
                  className="rounded-xl h-11 px-5 border-border/60 hover:bg-muted/50"
                >
                  <ArrowRight className="h-4 w-4 me-2" />
                  السابق
                </Button>
              ) : (
                <div />
              )}

              <Button
                onClick={handleNext}
                disabled={loading}
                className="rounded-xl h-11 px-6 bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md shadow-primary/15 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step === 1 ? (
                  <>
                    <UserPlus className="h-4 w-4 me-2" />
                    إنشاء الحساب
                  </>
                ) : (
                  <>
                    التالي
                    <ArrowLeft className="h-4 w-4 ms-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          </fieldset>

          {/* Login link */}
          {step === 1 && !existingAccount && (
            <p className="mt-7 text-center text-sm text-muted-foreground">
              لديك حساب بالفعل؟{" "}
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center text-primary font-semibold hover:underline underline-offset-4 transition-colors"
              >
                تسجيل الدخول
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <RegisterPageContent />
    </Suspense>
  );
}
