"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TermsConsentText } from "@/components/shared/terms-consent-text";
import { arabicLetterCount, isArabicName, NAME_MAX_LENGTH, TERMS_REQUIRED_MESSAGE } from "@/lib/phone";
import type { CountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type RegisterGender = "MALE" | "FEMALE";

export interface RegisterValues {
  firstName: string;
  lastName: string;
  gender: RegisterGender;
  /** "" or 8 characters */
  referralCode: string;
}

type Field = "firstName" | "lastName" | "gender" | "terms";

/** Invite codes are 8 capital letters or digits */
export function cleanInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/** Today's sign-up name rules (Arabic letters only, at least 2), checked per field */
function nameError(value: string, label: "الاسم الأول" | "اسم العائلة"): string | null {
  if (arabicLetterCount(value) < 2) return value.trim() ? `${label} يجب أن يكون حرفين على الأقل` : `${label} مطلوب`;
  if (!isArabicName(value)) return `${label} يجب أن يكون بالعربية فقط، بلا أرقام أو رموز`;
  return null;
}

const GENDERS = [
  { value: "MALE", title: "رجل", sub: "أبحث عن زوجة" },
  { value: "FEMALE", title: "امرأة", sub: "أبحث عن زوج" },
] as const;

/**
 * «بياناتك الأساسية»: the last step for a new number. Names, «أنا», terms and an optional invite code behind a
 * link. Each error sits under its own field; the parent runs the requests and passes back a request-level error.
 */
export function RegisterCard({
  country,
  inviteCode,
  initialGender,
  submitting,
  error,
  onSubmit,
  onChangeNumber,
}: {
  /** The number's country: the terms links follow it */
  country: CountryCode;
  /** From an invite link: the field opens filled */
  inviteCode?: string;
  /** From the landing page's quick start */
  initialGender?: RegisterGender;
  submitting: boolean;
  /** A refusal not about one field (server error, expired code) */
  error: string;
  onSubmit: (values: RegisterValues) => void;
  /** Back to the phone screen (e.g. the verified code expired before the account was made) */
  onChangeNumber: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<RegisterGender | "">(initialGender ?? "");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const invite = cleanInviteCode(inviteCode ?? "");
  const [showInvite, setShowInvite] = useState(invite.length > 0);
  const [referralCode, setReferralCode] = useState(invite);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const clear = (f: Field) => setErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  /** A typed name: non-Arabic letters are dropped as they are typed, and saying why (else the key seems dead) */
  const typedName = (f: "firstName" | "lastName", label: string, raw: string, set: (v: string) => void) => {
    const kept = arabicOnly(raw);
    set(kept);
    if (kept !== raw) setErrors((e) => ({ ...e, [f]: `${label} يجب أن يكون بالعربية فقط، بلا أرقام أو رموز` }));
    else clear(f);
  };
  const invalid = (f: Field) =>
    errors[f] ? { "aria-invalid": true as const, "aria-describedby": `register-${f}-error` } : {};

  function submit() {
    const next: Partial<Record<Field, string>> = {};
    const first = nameError(firstName, "الاسم الأول");
    if (first) next.firstName = first;
    const last = nameError(lastName, "اسم العائلة");
    if (last) next.lastName = last;
    if (!gender) next.gender = "يرجى اختيار الجنس";
    if (!termsAccepted) next.terms = TERMS_REQUIRED_MESSAGE;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstBad = (["firstName", "lastName", "gender", "terms"] as const).find((f) => next[f]);
      document.getElementById(`register-${firstBad}`)?.focus();
      return;
    }
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender: gender as RegisterGender,
      referralCode: referralCode.length === 8 ? referralCode : "",
    });
  }

  // Arabic letters and spaces only, as today
  const arabicOnly = (v: string) => v.replace(/[^؀-ۿ\s]/g, "");
  const rowClass = "flex min-h-13 items-center gap-3 px-4";
  const inputClass = "h-12 min-w-0 flex-1 bg-transparent text-end text-body text-ink outline-none placeholder:text-muted-ink/60";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h1 className="font-display text-display-sm text-ink">بياناتك الأساسية</h1>
      <p className="mt-1 mb-5 text-body text-muted-ink">خطوة أخيرة لإنشاء حسابك. يظهر اسمك الأول فقط للطرف الآخر.</p>

      <p className="mb-1.5 px-1 text-label font-normal text-muted-ink">الاسم بالعربية</p>
      {/* One card for both names: either name's error marks the card, as the other fields mark theirs */}
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card focus-within:ring-2 focus-within:ring-primary/30",
          errors.firstName || errors.lastName ? "border-destructive" : "border-transparent",
        )}
      >
        <div className={cn(rowClass, "border-b border-border")}>
          <label htmlFor="register-firstName" className="shrink-0 text-body text-ink">
            الاسم الأول
          </label>
          <input
            ref={firstRef}
            id="register-firstName"
            {...invalid("firstName")}
            value={firstName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="given-name"
            dir="rtl"
            onChange={(e) => typedName("firstName", "الاسم الأول", e.target.value, setFirstName)}
            className={inputClass}
          />
        </div>
        <div className={rowClass}>
          <label htmlFor="register-lastName" className="shrink-0 text-body text-ink">
            اسم العائلة
          </label>
          <input
            id="register-lastName"
            {...invalid("lastName")}
            value={lastName}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="family-name"
            dir="rtl"
            onChange={(e) => typedName("lastName", "اسم العائلة", e.target.value, setLastName)}
            className={inputClass}
          />
        </div>
      </div>
      {errors.firstName && (
        <p id="register-firstName-error" className="mt-2 px-1 text-label text-destructive">
          {errors.firstName}
        </p>
      )}
      {errors.lastName && (
        <p id="register-lastName-error" className="mt-2 px-1 text-label text-destructive">
          {errors.lastName}
        </p>
      )}

      <p id="register-gender-label" className="mt-5 mb-1.5 px-1 text-label font-normal text-muted-ink">
        أنا
      </p>
      <div
        id="register-gender"
        tabIndex={-1}
        role="group"
        aria-labelledby="register-gender-label"
        aria-describedby={errors.gender ? "register-gender-error" : undefined}
        className="grid grid-cols-2 gap-2.5 outline-none"
      >
        {GENDERS.map((o) => {
          const on = gender === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setGender(o.value);
                clear("gender");
              }}
              className={cn(
                "relative flex min-h-11 flex-col items-center gap-0.5 rounded-xl bg-card px-3 py-3.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                on ? "border-2 border-primary" : errors.gender ? "border border-destructive" : "border border-border hover:border-primary/40",
              )}
            >
              {on && <Check className="absolute start-2.5 top-2 size-4 text-primary" aria-hidden />}
              <span className="text-headline font-bold text-ink">{o.title}</span>
              <span className="text-caption text-muted-ink">{o.sub}</span>
            </button>
          );
        })}
      </div>
      {errors.gender && (
        <p id="register-gender-error" className="mt-2 px-1 text-label text-destructive">
          {errors.gender}
        </p>
      )}

      {showInvite ? (
        <div className="mt-4">
          <label htmlFor="register-invite" className="mb-1.5 block px-1 text-label font-normal text-muted-ink">
            رمز الدعوة (اختياري)
          </label>
          <input
            id="register-invite"
            value={referralCode}
            placeholder="XXXXXXXX"
            dir="ltr"
            autoComplete="off"
            onChange={(e) => setReferralCode(cleanInviteCode(e.target.value))}
            className="h-12 w-full rounded-xl border border-border bg-card px-4 text-center font-mono text-body tracking-[0.1em] text-ink outline-none focus:border-2 focus:border-primary"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="mt-2 inline-flex min-h-11 items-center px-1 text-label font-bold text-primary hover:underline underline-offset-4"
        >
          لديك رمز دعوة؟
        </button>
      )}

      <label
        htmlFor="register-terms"
        className={cn(
          "mt-3 flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3",
          errors.terms ? "border-destructive" : "border-transparent",
        )}
      >
        <input
          id="register-terms"
          type="checkbox"
          {...invalid("terms")}
          checked={termsAccepted}
          onChange={(e) => {
            setTermsAccepted(e.target.checked);
            clear("terms");
          }}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
        />
        <TermsConsentText country={country} />
      </label>
      {errors.terms && (
        <p id="register-terms-error" className="mt-2 px-1 text-label text-destructive">
          {errors.terms}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="mt-5 h-13 w-full rounded-xl text-body font-bold">
        {submitting && <Loader2 className="size-5 animate-spin" aria-hidden />}
        إنشاء الحساب
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-center text-label text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onChangeNumber}
          disabled={submitting}
          className="inline-flex min-h-11 items-center text-label font-bold text-primary hover:underline underline-offset-4 disabled:pointer-events-none disabled:opacity-50"
        >
          تغيير الرقم
        </button>
      </div>
    </form>
  );
}
