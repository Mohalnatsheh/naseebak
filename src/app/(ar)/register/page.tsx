"use client";

import { useState, useRef, useMemo, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  UserPlus,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Upload,
  Phone,
  Check,
  Shield,
  FileImage,
  Camera,
  Send,
} from "lucide-react";
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

/* ------------------------------------------------------------------ */
/*  Sparkle / confetti CSS-only particles                             */
/* ------------------------------------------------------------------ */
function Sparkles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 1.8 + Math.random() * 1.5,
        size: 4 + Math.random() * 6,
        color: [
          "#d4a853",
          "#2563eb",
          "#3b82f6",
          "#eab308",
          "#ec4899",
          "#8b5cf6",
        ][Math.floor(Math.random() * 6)],
      })),
    []
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

/* ------------------------------------------------------------------ */
/*  Helper: convert File to base64 data URL                           */
/* ------------------------------------------------------------------ */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */
function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);

  /* Slide animation direction */
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const [animating, setAnimating] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    gender: "" as "MALE" | "FEMALE" | "",
    otp: "",
  });

  // Track if OTP was already verified (e.g. redirected from login)
  const [otpAlreadyVerified, setOtpAlreadyVerified] = useState(false);

  // Pre-fill phone + OTP from URL params (e.g. redirected from login after OTP verification)
  useEffect(() => {
    const phoneParam = searchParams.get("phone");
    const otpParam = searchParams.get("otp");
    const otpVerified = searchParams.get("otpVerified");
    if (phoneParam) {
      setForm((prev) => ({ ...prev, phone: phoneParam, otp: otpParam || "" }));
      if (otpVerified === "1" && otpParam) {
        setOtpSent(true);
        setOtpAlreadyVerified(true);
      }
    }
  }, [searchParams]);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Optional photo
  const [wantsPhoto, setWantsPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Identity document state
  const [frontDoc, setFrontDoc] = useState<File | null>(null);
  const [backDoc, setBackDoc] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // Drag states
  const [frontDragging, setFrontDragging] = useState(false);
  const [backDragging, setBackDragging] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileSelect(file: File | null, side: "front" | "back") {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
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
    const previewUrl = URL.createObjectURL(file);

    if (side === "front") {
      setFrontDoc(file);
      setFrontPreview(previewUrl);
    } else {
      setBackDoc(file);
      setBackPreview(previewUrl);
    }
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

  function handleDrop(
    e: React.DragEvent<HTMLButtonElement>,
    side: "front" | "back"
  ) {
    e.preventDefault();
    if (side === "front") setFrontDragging(false);
    else setBackDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file, side);
  }

  async function handleSendOtp() {
    setError("");
    setSendingOtp(true);
    const normalizedPhone = normalizePhone(form.phone);

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
        setError("الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء إرسال رمز التحقق");
        return;
      }

      // If phone already registered, block registration immediately
      if (data.userExists) {
        setError("رقم الهاتف مسجل مسبقاً. يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.");
        return;
      }

      setOtpSent(true);
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
    } finally {
      setSendingOtp(false);
    }
  }

  function validateStep1(): boolean {
    setError("");

    if (!form.firstName || form.firstName.length < 2) {
      setError("الاسم الأول يجب أن يكون حرفين على الأقل");
      return false;
    }
    if (!form.lastName || form.lastName.length < 2) {
      setError("اسم العائلة يجب أن يكون حرفين على الأقل");
      return false;
    }
    if (!form.gender) {
      setError("يرجى اختيار الجنس");
      return false;
    }
    if (!form.phone) {
      setError("يرجى إدخال رقم الهاتف");
      return false;
    }
    const cleaned = form.phone.replace(/[\s\-()]/g, "");
    if (!/^(?:00962|0?0?\+?962|0)?7[789]\d{7}$/.test(cleaned)) {
      setError("رقم الهاتف غير صالح. الصيغ المقبولة: 07X, 7X, 9627X, +9627X, 009627X");
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
    return true;
  }

  function validateStep2(): boolean {
    setError("");
    if (!frontDoc) {
      setError("يرجى رفع صورة الوجه الأمامي للهوية");
      return false;
    }
    if (!backDoc) {
      setError("يرجى رفع صورة الوجه الخلفي للهوية");
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
    if (step === 2 && !validateStep2()) return;

    if (step === 2) {
      handleSubmit();
      return;
    }

    goToStep(step + 1);
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const normalizedPhone = normalizePhone(form.phone);

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
          setError("الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.");
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
          firstName: form.firstName,
          lastName: form.lastName,
          phone: normalizedPhone,
          gender: form.gender,
          otp: form.otp,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError("الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.");
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
        setError("حدث خطأ أثناء تسجيل الدخول التلقائي");
        return;
      }

      // Step 4: Upload identity documents (convert to base64)
      if (frontDoc && backDoc) {
        const [frontBase64, backBase64] = await Promise.all([
          fileToBase64(frontDoc),
          fileToBase64(backDoc),
        ]);

        await fetch("/api/identity/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: "national_id",
            frontImageData: frontBase64,
            backImageData: backBase64,
          }),
        });
      }

      // Step 5: Upload optional photo if selected
      if (wantsPhoto && photoFile) {
        // Store photo for now (just log it -- full implementation later)
        // In production, this would upload to /api/profile/photos
      }

      // Move to success step
      goToStep(3);
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Step labels for the wizard                                      */
  /* ---------------------------------------------------------------- */
  const stepLabels = ["معلومات الحساب", "وثائق الهوية", "تم بنجاح"];

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      {/* ---- Gradient background ---- */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="fixed inset-0 -z-10 opacity-40">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/8 blur-3xl" />
      </div>

      {/* ---- Main card with glassmorphism ---- */}
      <Card className="relative w-full max-w-lg border-white/40 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/5">
        <CardHeader className="text-center space-y-3 pb-2">
          <Link
            href="/"
            className="inline-block text-4xl font-extrabold bg-gradient-to-l from-primary via-primary to-accent bg-clip-text text-transparent tracking-tight"
          >
            نصيبك
          </Link>
          <CardTitle className="text-xl font-bold">
            إنشاء حساب جديد
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
                      className={`text-[10px] font-medium whitespace-nowrap transition-colors duration-300 ${
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
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-sm text-destructive mb-5 flex items-center gap-2 animate-[shake_0.4s_ease-in-out]">
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
                      value={form.firstName}
                      onChange={(e) => updateField("firstName", e.target.value)}
                      className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      required
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
                      value={form.lastName}
                      onChange={(e) => updateField("lastName", e.target.value)}
                      className="h-11 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                      required
                    />
                  </div>
                </div>

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
                          ? "border-transparent bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg shadow-blue-500/10"
                          : "border-border/60 hover:border-blue-300 hover:shadow-md bg-muted/20"
                      }`}
                    >
                      {form.gender === "MALE" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10" />
                      )}
                      {form.gender === "MALE" && (
                        <div
                          className="absolute inset-0 rounded-[14px] m-px"
                          style={{
                            background:
                              "linear-gradient(135deg, #3b82f6, #6366f1)",
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
                              ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md"
                              : "bg-muted text-muted-foreground group-hover:bg-blue-100 group-hover:text-blue-600"
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
                              ? "text-blue-700"
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
                          ? "border-transparent bg-gradient-to-br from-pink-50 to-rose-100 shadow-lg shadow-pink-500/10"
                          : "border-border/60 hover:border-pink-300 hover:shadow-md bg-muted/20"
                      }`}
                    >
                      {form.gender === "FEMALE" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 opacity-10" />
                      )}
                      {form.gender === "FEMALE" && (
                        <div
                          className="absolute inset-0 rounded-[14px] m-px"
                          style={{
                            background:
                              "linear-gradient(135deg, #ec4899, #e11d48)",
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
                              ? "bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md"
                              : "bg-muted text-muted-foreground group-hover:bg-pink-100 group-hover:text-pink-600"
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
                              ? "text-pink-700"
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
                    رقم الهاتف
                  </Label>
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 flex items-center pl-3 pointer-events-none z-10">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <svg width="20" height="14" viewBox="0 0 22 16" className="rounded-sm shadow-sm shrink-0">
                          <rect width="22" height="5.33" fill="#000" />
                          <rect y="5.33" width="22" height="5.33" fill="#fff" />
                          <rect y="10.66" width="22" height="5.34" fill="#007A3D" />
                          <polygon points="0,0 10,8 0,16" fill="#CE1126" />
                          <polygon points="3.6,6.4 4.2,8 3,7 4.4,7 3.2,8" fill="#fff" transform="scale(0.7) translate(1.5,5)" />
                        </svg>
                        <span className="font-medium text-xs">+962</span>
                      </span>
                      <span className="mx-2 h-4 w-px bg-border/60" />
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="7XXXXXXXX"
                      value={form.phone}
                      onChange={(e) => {
                        updateField("phone", e.target.value);
                        if (otpSent) {
                          setOtpSent(false);
                          updateField("otp", "");
                        }
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
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      value={form.otp}
                      onChange={(e) => updateField("otp", e.target.value.replace(/\D/g, "").slice(0, 6))}
                      dir="ltr"
                      className="h-11 rounded-xl border-border/60 bg-muted/30 text-center text-lg tracking-[0.3em] font-mono focus:bg-background transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors duration-300 font-medium"
                    >
                      إعادة إرسال رمز التحقق
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
                <div className="flex items-center gap-3 p-3 bg-gradient-to-l from-primary/5 to-blue-50/50 rounded-xl border border-primary/10 text-sm text-muted-foreground">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <span className="leading-relaxed text-xs">
                    اسمك الكامل ورقم هاتفك محميان بالكامل ولن يظهرا لأي مستخدم آخر على المنصة. يُعرض فقط الاسم الأول للمستخدمين الآخرين
                  </span>
                </div>

                {/* ---- Optional photo upload ---- */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-300 ${
                        wantsPhoto ? "bg-primary" : "bg-muted"
                      }`}
                      onClick={() => setWantsPhoto(!wantsPhoto)}
                    >
                      <div
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ${
                          wantsPhoto ? "start-[calc(100%-1.125rem)]" : "start-0.5"
                        }`}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">
                      أرغب بإضافة صورة شخصية
                    </span>
                  </label>

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
              </div>
            )}

            {/* ======================================== */}
            {/*  STEP 2 -- Identity Document Upload       */}
            {/* ======================================== */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="text-center mb-1 space-y-1.5">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
                    <Shield className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg">رفع وثائق الهوية</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    يرجى رفع صورة واضحة للوجهين الأمامي والخلفي للهوية
                    الحكومية
                  </p>
                </div>

                {/* Front of ID */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      1
                    </div>
                    الوجه الأمامي للهوية
                  </Label>
                  <input
                    ref={frontInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      handleFileSelect(e.target.files?.[0] || null, "front")
                    }
                  />
                  {frontPreview ? (
                    <div className="relative rounded-2xl border-2 border-primary/30 overflow-hidden group shadow-md">
                      <img
                        src={frontPreview}
                        alt="الوجه الأمامي"
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md">
                        <Check className="h-4 w-4" />
                      </div>
                      <button
                        type="button"
                        onClick={() => frontInputRef.current?.click()}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-sm font-medium backdrop-blur-sm"
                      >
                        <Upload className="h-5 w-5 me-2" />
                        تغيير الصورة
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => frontInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setFrontDragging(true);
                      }}
                      onDragLeave={() => setFrontDragging(false)}
                      onDrop={(e) => handleDrop(e, "front")}
                      className={`group w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all duration-300 ${
                        frontDragging
                          ? "border-primary bg-primary/5 scale-[1.02]"
                          : "border-border/60 hover:border-primary/50 hover:bg-muted/30 hover:shadow-inner"
                      }`}
                    >
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 ${
                          frontDragging
                            ? "bg-primary/15 text-primary scale-110"
                            : "bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-105"
                        }`}
                      >
                        <Upload className="h-7 w-7" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-medium text-foreground/80">
                          اسحب الصورة هنا أو اضغط للرفع
                        </span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          JPG, PNG, WebP &mdash; حد أقصى 5MB
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                {/* Back of ID */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      2
                    </div>
                    الوجه الخلفي للهوية
                  </Label>
                  <input
                    ref={backInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      handleFileSelect(e.target.files?.[0] || null, "back")
                    }
                  />
                  {backPreview ? (
                    <div className="relative rounded-2xl border-2 border-primary/30 overflow-hidden group shadow-md">
                      <img
                        src={backPreview}
                        alt="الوجه الخلفي"
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md">
                        <Check className="h-4 w-4" />
                      </div>
                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center text-white text-sm font-medium backdrop-blur-sm"
                      >
                        <Upload className="h-5 w-5 me-2" />
                        تغيير الصورة
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => backInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setBackDragging(true);
                      }}
                      onDragLeave={() => setBackDragging(false)}
                      onDrop={(e) => handleDrop(e, "back")}
                      className={`group w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all duration-300 ${
                        backDragging
                          ? "border-primary bg-primary/5 scale-[1.02]"
                          : "border-border/60 hover:border-primary/50 hover:bg-muted/30 hover:shadow-inner"
                      }`}
                    >
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 ${
                          backDragging
                            ? "bg-primary/15 text-primary scale-110"
                            : "bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-105"
                        }`}
                      >
                        <Upload className="h-7 w-7" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-medium text-foreground/80">
                          اسحب الصورة هنا أو اضغط للرفع
                        </span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          JPG, PNG, WebP &mdash; حد أقصى 5MB
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                {/* Info banner */}
                <div className="flex items-center gap-3 p-3.5 bg-gradient-to-l from-primary/5 to-accent/5 rounded-xl border border-primary/10 text-sm text-muted-foreground">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileImage className="h-4 w-4 text-primary" />
                  </div>
                  <span className="leading-relaxed">
                    وثائق الهوية تُستخدم فقط للتحقق من هويتك ولن يطّلع عليها أي مستخدم آخر. يتم مراجعتها بسرية تامة من قبل الإدارة
                  </span>
                </div>
              </div>
            )}

            {/* ======================================== */}
            {/*  STEP 3 -- Success / Waiting              */}
            {/* ======================================== */}
            {step === 3 && (
              <div className="relative text-center space-y-7 py-8">
                <Sparkles />
                <AnimatedCheck />
                <div className="space-y-3 relative">
                  <h3 className="text-2xl font-extrabold bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">
                    تم إنشاء حسابك بنجاح!
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm max-w-xs mx-auto">
                    جارٍ مراجعة وثائق الهوية من قبل فريقنا المختص. سيتم
                    إعلامك عند الانتهاء من التحقق.
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    يمكنك البدء في إعداد ملفك الشخصي في هذه الأثناء
                  </p>
                </div>
                <Button
                  onClick={() => {
                    router.push("/dashboard");
                    router.refresh();
                  }}
                  className="w-full h-12 rounded-xl text-base font-bold bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5"
                >
                  الانتقال للوحة التحكم
                  <ArrowLeft className="h-5 w-5 ms-2" />
                </Button>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/*  Navigation buttons                          */}
          {/* ============================================ */}
          {step < 3 && (
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
                ) : step === 2 ? (
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

          {/* Login link */}
          {step === 1 && (
            <p className="mt-7 text-center text-sm text-muted-foreground">
              لديك حساب بالفعل؟{" "}
              <Link
                href="/login"
                className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
              >
                سجّل الدخول
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
