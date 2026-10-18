"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { cleanStartPhone, saveLandingStart, type StartGender } from "@/lib/landing-start";
import { cn } from "@/lib/utils";

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
}: {
  place: "hero" | "final";
  gender: StartGender | null;
  onGender: (g: StartGender) => void;
  /** dark = on the navy hero / final band */
  tone?: "dark" | "light";
  id?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);
  const dark = tone === "dark";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gender) {
      setError("اختر من تبحث عنه أولاً");
      return;
    }
    const clean = cleanStartPhone(phone);
    if (clean === null) {
      setError("رقم الهاتف غير صالح. مثال: 0791234567");
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
        <legend className={cn("mb-2.5 text-sm font-semibold", dark ? "text-white/80" : "text-foreground/80")}>أبحث عن</legend>
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
        رقم هاتفك الأردني <span className={dark ? "text-white/50" : "text-muted-foreground"}>(اختياري الآن)</span>
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id={`${uid}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="07X XXX XXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={!!error && cleanStartPhone(phone) === null}
          className={cn(
            "h-14 min-w-0 rounded-2xl border px-4 sm:flex-1 text-start text-base font-semibold tracking-wide outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
            dark
              ? "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-accent"
              : "border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary"
          )}
        />
        <button
          type="submit"
          disabled={going}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-7 text-lg font-extrabold text-accent-foreground shadow-[0_12px_30px_-12px_oklch(0.69_0.10_74/0.8)] transition-transform hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70 motion-safe:active:scale-[0.98]"
        >
          ابدأ مجاناً
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p id={`${uid}-err`} role="alert" className={cn("mt-2 min-h-5 text-sm font-semibold", dark ? "text-amber-200" : "text-destructive")}>
        {error}
      </p>
    </form>
  );
}
