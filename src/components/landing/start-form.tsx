"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { cleanStartPhone, saveLandingStart, type StartGender } from "@/lib/landing-start";
import { cn } from "@/lib/utils";
import { COUNTRIES, DEFAULT_COUNTRY, type CountryCode } from "@/lib/countries";

/** The phone field's placeholder after the dial code, grouped as people write it */
const PHONE_PLACEHOLDER: Record<CountryCode, string> = { JO: "7X XXX XXXX", SA: "5X XXX XXXX", LB: "3 XXX XXX" };

/** The form's lines: Jordan's for JO and SA, Lebanese dialect for LB (no gendered command) */
interface StartCopy {
  lookingFor: string;
  pickFirst: string;
  /** `handset` = «هاتف» / «جوال» */
  badPhone: (handset: string, example: string) => string;
  optional: string;
  start: string;
  hint: string;
}
const START_JO: StartCopy = {
  lookingFor: "أبحث عن",
  pickFirst: "اختر من تبحث عنه أولاً",
  badPhone: (handset, example) => `رقم ال${handset} غير صالح. مثال: ${example}`,
  optional: "(اختياري الآن)",
  start: "ابدأ التسجيل",
  hint: "رقمك لا يظهر لأي مستخدم، ونرسل عليه رمز التحقق فقط. التسجيل مجاني.",
};
const START_COPY: Record<CountryCode, StartCopy> = {
  JO: START_JO,
  SA: START_JO,
  LB: {
    lookingFor: "عم دوّر على",
    pickFirst: "أول شي: زوجة أو زوج؟",
    badPhone: (handset, example) => `رقم ال${handset} مش صحيح. مثال: ${example}`,
    optional: "(اختياري هلّق)",
    start: "يلّا نبلّش",
    hint: "رقمك ما بيظهر لحدا، ومنبعتلك عليه رمز التحقق بس. التسجيل ببلاش.",
  },
};

const CHOICES: { value: StartGender; label: string }[] = [
  { value: "MALE", label: "زوجة" },
  { value: "FEMALE", label: "زوج" },
];

/**
 * The quick start: one tap for who you're looking for, an optional phone number, then /register
 * opens with both filled in. Nothing goes in the URL.
 */
export function StartForm({
  place,
  gender,
  onGender,
  tone = "dark",
  id,
  country = DEFAULT_COUNTRY,
}: {
  place: "hero" | "final";
  gender: StartGender | null;
  onGender: (g: StartGender) => void;
  /** dark = on the navy hero / final band */
  tone?: "dark" | "light";
  id?: string;
  /** Visitor's country: dial code, placeholder and phone check */
  country?: CountryCode;
}) {
  const cfg = COUNTRIES[country];
  const copy = START_COPY[country];
  /** «هاتف» / «جوال» */
  const handset = cfg.words.phone;
  const router = useRouter();
  const uid = useId();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);
  const dark = tone === "dark";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gender) {
      setError(copy.pickFirst);
      return;
    }
    const clean = cleanStartPhone(phone, country);
    if (clean === null) {
      setError(copy.badPhone(handset, cfg.phone.example));
      return;
    }
    setError("");
    setGoing(true);
    saveLandingStart(typeof window === "undefined" ? undefined : window.sessionStorage, { gender, phone: clean });
    trackEvent("landing_start", { place });
    router.push("/register?from=landing");
  }

  return (
    <form id={id} onSubmit={submit} noValidate className="w-full max-w-md scroll-mt-28" aria-describedby={error ? `${uid}-err` : undefined}>
      <fieldset>
        <legend className={cn("mb-2.5 text-sm font-semibold", dark ? "text-white/80" : "text-foreground/80")}>{copy.lookingFor}</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {CHOICES.map((c) => {
            const on = gender === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  onGender(c.value);
                  setError("");
                }}
                className={cn(
                  "h-14 rounded-2xl border-2 text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  dark ? "focus-visible:ring-offset-primary" : "focus-visible:ring-offset-background",
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : dark
                    ? "border-white/25 bg-white/5 text-white hover:border-white/50"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label htmlFor={`${uid}-phone`} className={cn("mt-4 block text-sm font-semibold", dark ? "text-white/80" : "text-foreground/80")}>
        رقم {handset}ك <span className={dark ? "text-white/50" : "text-muted-foreground"}>{copy.optional}</span>
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div
          dir="ltr"
          className={cn(
            "flex h-14 min-w-0 items-center rounded-2xl border transition-colors focus-within:ring-2 focus-within:ring-accent sm:flex-1",
            dark ? "border-white/20 bg-white/10 focus-within:border-accent" : "border-border bg-card focus-within:border-primary"
          )}
        >
          <span className={cn("ps-4 pe-2 text-base font-bold", dark ? "text-white/60" : "text-muted-foreground")} aria-hidden>
            +{cfg.dialCode}
          </span>
          <input
            id={`${uid}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={PHONE_PLACEHOLDER[country]}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!!error && cleanStartPhone(phone, country) === null}
            aria-describedby={`${uid}-hint`}
            className={cn(
              "h-full min-w-0 flex-1 rounded-e-2xl bg-transparent pe-4 text-start text-base font-semibold tracking-wide outline-none",
              dark ? "text-white placeholder:text-white/40" : "text-foreground placeholder:text-muted-foreground"
            )}
          />
        </div>
        <button
          type="submit"
          disabled={going}
          className={cn(
            "inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-lg font-extrabold transition-transform hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-70 motion-safe:active:scale-[0.98]",
            // Gold only on the navy hero / final band; navy on a light background (design review P2-4 / DS-18)
            dark
              ? "bg-accent text-primary-deep shadow-[0_12px_30px_-12px_oklch(0.69_0.10_74/0.8)] focus-visible:ring-white"
              : "bg-primary text-primary-foreground focus-visible:ring-primary"
          )}
        >
          {going ? "لحظة…" : copy.start}
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p id={`${uid}-hint`} className={cn("mt-2 text-xs", dark ? "text-white/60" : "text-muted-foreground")}>
        {copy.hint}
      </p>
      <p id={`${uid}-err`} role="alert" className={cn("mt-1 min-h-5 text-sm font-semibold", dark ? "text-amber-200" : "text-destructive")}>
        {error}
      </p>
    </form>
  );
}
