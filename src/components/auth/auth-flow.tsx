"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthFrame } from "@/components/auth/auth-frame";
import { PhoneStep } from "@/components/auth/phone-step";
import { CODE_LENGTH, CodeStep } from "@/components/auth/code-step";
import { RegisterCard, type RegisterGender, type RegisterValues } from "@/components/auth/register-card";
import { useVisitorCountry } from "@/components/shared/visitor-country";
import { COUNTRIES, type CountryCode } from "@/lib/countries";
import { toLatinDigits } from "@/lib/digits";
import { localPhone, normalizePhone } from "@/lib/phone";
import { dialCountryFor, isPhoneFor, phoneExampleError, phoneWord } from "@/lib/phone-field";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { rateLimitedMinutes } from "@/lib/login-limit";
import { arabicCount } from "@/lib/utils";
import { trackEvent, trackMetaEvent } from "@/lib/analytics";
import { takeLandingStart } from "@/lib/landing-start";

/** Seconds before another code may be requested (the server also limits 3 per 5 minutes) */
const RESEND_SECONDS = 60;
const BUSY = "الخادم مشغول حالياً. يمكنك المحاولة مرة أخرى بعد قليل.";
const UNEXPECTED = "حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.";
const UNEXPECTED_SHORT = "حدث خطأ غير متوقع";
export const WRONG_CODE = "الرمز غير صحيح. تأكد من آخر رسالة وصلتك.";
/** The old login page's private handoff of a verified new number (kept readable for old links) */
const HANDOFF_KEY = "naseeb:register-handoff";
const HANDOFF_MAX_AGE_MS = 10 * 60 * 1000;

const emptyDigits = () => Array.from({ length: CODE_LENGTH }, () => "");

/** "962791234567" → "+962 7•••••67" */
function maskPhone(intl: string, country: CountryCode): string {
  const dial = COUNTRIES[country].dialCode;
  const national = intl.startsWith(dial) ? intl.slice(dial.length) : intl;
  if (national.length < 4) return `+${dial} ${national}`;
  return `+${dial} ${national[0]}${"•".repeat(national.length - 3)}${national.slice(-2)}`;
}

/** A JSON body, or null when the server answered something else (Nginx may answer HTML on a 503) */
async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
const errorText = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

type Step = "phone" | "code" | "register";

/**
 * The redesigned sign-in and sign-up (switch auth_profile_redesign): «ما رقم هاتفك؟» → «أدخل الرمز» → a member signs
 * in, a new number fills «بياناتك الأساسية». Both modes send the `login` context, so nothing says whether a number is
 * registered before the code is verified; only verify-otp decides.
 */
export function AuthFlow({
  mode,
  callbackUrl,
  inviteCode,
  existsNotice,
}: {
  mode: "login" | "register";
  callbackUrl?: string;
  inviteCode?: string;
  /** `/login?exists=true`: sent back from a sign-up that found the number registered */
  existsNotice?: boolean;
}) {
  const router = useRouter();
  const visitorCountry = useVisitorCountry();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<CountryCode>(visitorCountry);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [sending, setSending] = useState(false);

  /** The number the code went to (international form) and its channel */
  const [sentTo, setSentTo] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [codeError, setCodeError] = useState("");
  const [wrongCode, setWrongCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  /** The verified code of a new number, kept in memory only for the register request */
  const [verifiedCode, setVerifiedCode] = useState("");

  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);
  /** The account was made but the invite code was refused: said before going on to setup */
  const [inviteNotice, setInviteNotice] = useState("");
  const [startGender, setStartGender] = useState<RegisterGender | undefined>(undefined);
  /** One verify request at a time (auto-submit at the sixth digit) */
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Sign-up arrivals: the old login page's handoff (old links), or the landing page's quick start
  useEffect(() => {
    if (mode !== "register") return;
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (raw) {
        sessionStorage.removeItem(HANDOFF_KEY);
        const handoff = JSON.parse(raw) as { phone?: string; otp?: string; at?: number };
        if (handoff.phone && handoff.otp && Date.now() - (handoff.at ?? 0) < HANDOFF_MAX_AGE_MS) {
          const dial = dialCountryFor(handoff.phone, visitorCountry);
          setCountry(dial);
          setPhone(localPhone(handoff.phone, dial));
          setSentTo(normalizePhone(handoff.phone, dial));
          setVerifiedCode(handoff.otp);
          setStep("register");
          return;
        }
      }
    } catch {
      // a malformed handoff: start at the phone screen
    }
    const start = takeLandingStart(typeof window === "undefined" ? undefined : window.sessionStorage);
    if (start) {
      setStartGender(start.gender);
      if (start.phone) {
        setPhone(start.phone);
        setCountry((c) => dialCountryFor(start.phone, c));
      }
    }
  }, [mode, visitorCountry]);

  /** POST send-otp; returns the server's refusal text, or null when the code is on its way */
  async function requestCode(intl: string): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: intl, context: "login", country }),
      });
      const data = await readJson(res);
      if (!data) return BUSY;
      if (!res.ok) return errorText(data.error, "حدث خطأ أثناء إرسال رمز التحقق");
      // `userExists` in this answer is ignored: only a verified code says whether the number is a member
      setWhatsapp(data.channel === "whatsapp");
      setResendIn(RESEND_SECONDS);
      trackEvent("otp_requested", { context: "login" });
      return null;
    } catch {
      return UNEXPECTED;
    }
  }

  async function sendCode() {
    if (sending) return;
    setPhoneError("");
    if (!isPhoneFor(phone, country)) {
      setPhoneError(phoneExampleError(country));
      return;
    }
    const intl = normalizePhone(phone, country);
    setSending(true);
    const refused = await requestCode(intl);
    setSending(false);
    if (refused) {
      setPhoneError(refused);
      return;
    }
    setSentTo(intl);
    setDigits(emptyDigits());
    setCodeError("");
    setWrongCode(false);
    setStep("code");
  }

  async function resendCode() {
    if (resending || resendIn > 0) return;
    setResending(true);
    setCodeError("");
    setWrongCode(false);
    const refused = await requestCode(sentTo);
    setResending(false);
    if (refused) setCodeError(refused);
    else setDigits(emptyDigits());
  }

  function backToPhone() {
    setStep("phone");
    setDigits(emptyDigits());
    setCodeError("");
    setWrongCode(false);
    setResendIn(0);
    setVerifiedCode("");
    setRegisterError("");
  }

  function failCode(message: string, wrong = false) {
    setCodeError(message);
    setWrongCode(wrong);
    setDigits(emptyDigits());
  }

  async function verify(code: string) {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setCodeError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sentTo, code }),
      });
      const data = await readJson(res);
      if (!data) return failCode(BUSY);
      // 400 = a wrong or expired code; anything else (too many tries, server error) keeps the server's own words
      if (!res.ok) return res.status === 400 ? failCode(WRONG_CODE, true) : failCode(errorText(data.error, "رمز التحقق غير صالح"));

      if (!data.userExists) {
        // A new number: on to «بياناتك الأساسية», with the number and code kept in memory only
        setVerifiedCode(code);
        setStep("register");
        return;
      }

      const result = await signIn("credentials", { phone: sentTo, otp: code, redirect: false });
      if (result?.error) {
        // The code was verified and is now used up: typing it again would only read as a wrong code, so a new one
        // may be requested at once
        const waitMinutes = rateLimitedMinutes(result.code);
        failCode(
          waitMinutes
            ? `محاولات دخول كثيرة غير ناجحة. يمكنك المحاولة مرة أخرى بعد ${arabicCount(waitMinutes, { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" })}.`
            : "فشل تسجيل الدخول. قد يكون حسابك معلقاً، أو يمكنك المحاولة مرة أخرى لاحقاً.",
        );
        setResendIn(0);
        return;
      }
      trackEvent("login", { method: "phone" });
      router.push(safeCallbackPath(callbackUrl, window.location.origin));
      router.refresh();
    } catch {
      failCode(UNEXPECTED);
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }

  function onDigitsChange(next: string[]) {
    setDigits(next);
    setCodeError("");
    setWrongCode(false);
    if (next.every((d) => d)) void verify(next.join(""));
  }

  /** POST referral/apply; the refusal text, or null when applied */
  async function applyInviteCode(code: string): Promise<string | null> {
    try {
      const res = await fetch("/api/referral/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) return null;
      const data = await readJson(res);
      return errorText(data?.error, UNEXPECTED_SHORT);
    } catch {
      return UNEXPECTED_SHORT;
    }
  }

  function goToSetup() {
    router.push("/dashboard/profile/setup");
    router.refresh();
  }

  async function register(values: RegisterValues) {
    if (registering) return;
    setRegistering(true);
    setRegisterError("");
    const accountCountry = dialCountryFor(sentTo, country);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          phone: sentTo,
          gender: values.gender,
          otp: verifiedCode,
          termsAccepted: true,
        }),
      });
      const data = await readJson(res);
      if (!data) return setRegisterError(BUSY);

      if (res.status === 409 && data.code === "PHONE_EXISTS") {
        // Registered after all (a race): the verified code signs in, and the member is told the names weren't saved
        const existing = await signIn("credentials", { phone: sentTo, otp: verifiedCode, redirect: false });
        if (existing?.error) {
          window.location.href = "/login?exists=true";
          return;
        }
        setExistingAccount(true);
        return;
      }
      if (!res.ok) return setRegisterError(errorText(data.error, "حدث خطأ أثناء التسجيل"));

      const signedIn = await signIn("credentials", { phone: sentTo, otp: verifiedCode, redirect: false });
      trackEvent("sign_up", { method: "phone" });
      trackMetaEvent("CompleteRegistration", { site_country: accountCountry });
      if (signedIn?.error) {
        // The account exists now; pressing «إنشاء الحساب» again would only fail
        window.location.href = "/login?exists=true";
        return;
      }

      if (values.referralCode) {
        // The account exists either way; a refused code is said before moving on
        const refused = await applyInviteCode(values.referralCode);
        if (refused) {
          setInviteNotice(`تم إنشاء حسابك. لم يُطبَّق رمز الدعوة: ${refused}`);
          return;
        }
      }

      goToSetup();
    } catch {
      setRegisterError(UNEXPECTED);
    } finally {
      setRegistering(false);
    }
  }

  const headerLink =
    step !== "phone"
      ? undefined
      : mode === "login"
        ? { lead: "جديد على نصيبك؟", label: "إنشاء حساب", href: "/register" }
        : { lead: "لديك حساب؟", label: "تسجيل الدخول", href: "/login" };

  return (
    <AuthFrame headerLink={headerLink}>
      {step === "phone" && mode === "login" && existsNotice && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-4 text-body text-primary">
          <Info className="size-4 shrink-0" aria-hidden />
          رقم {phoneWord(country)} مسجل مسبقاً. يمكنك تسجيل الدخول من هنا
        </div>
      )}

      {step === "phone" && (
        <PhoneStep
          country={country}
          onCountryChange={(c) => {
            setCountry(c);
            setPhoneError("");
          }}
          phone={phone}
          onPhoneChange={(raw) => {
            const v = toLatinDigits(raw);
            setPhone(v);
            setPhoneError("");
            // A full number of another country switches the dial code to it
            setCountry((c) => dialCountryFor(v, c));
          }}
          error={phoneError}
          sending={sending}
          onSubmit={sendCode}
        />
      )}

      {step === "code" && (
        <CodeStep
          phoneDisplay={maskPhone(sentTo, dialCountryFor(sentTo, country))}
          whatsapp={whatsapp}
          digits={digits}
          onDigitsChange={onDigitsChange}
          error={codeError}
          wrongCode={wrongCode}
          verifying={verifying}
          resendIn={resendIn}
          resending={resending}
          onResend={resendCode}
          onChangeNumber={backToPhone}
        />
      )}

      {step === "register" &&
        (existingAccount ? (
          <div role="status" className="space-y-4 rounded-xl bg-card p-5 text-body text-ink">
            <p className="flex items-start gap-2">
              <Info className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              هذا الرقم مسجّل بحساب سابق، وتم تسجيل الدخول إليه. لم يتغيّر الاسم المسجّل في الحساب.
            </p>
            <Button
              type="button"
              className="h-13 w-full rounded-xl text-body font-bold"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              المتابعة إلى حسابي
            </Button>
          </div>
        ) : inviteNotice ? (
          <div role="status" className="space-y-4 rounded-xl bg-card p-5 text-body text-ink">
            <p className="flex items-start gap-2">
              <Info className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              {inviteNotice}
            </p>
            <Button type="button" className="h-13 w-full rounded-xl text-body font-bold" onClick={goToSetup}>
              متابعة
            </Button>
          </div>
        ) : (
          <RegisterCard
            country={dialCountryFor(sentTo, country)}
            inviteCode={inviteCode}
            initialGender={startGender}
            submitting={registering}
            error={registerError}
            onSubmit={register}
            onChangeNumber={backToPhone}
          />
        ))}
    </AuthFrame>
  );
}
