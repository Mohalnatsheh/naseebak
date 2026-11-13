"use client";

import { useCallback, useEffect, useRef } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { toLatinDigits } from "@/lib/digits";
import { cn } from "@/lib/utils";
import { channelWords } from "@/components/auth/phone-step";

export const CODE_LENGTH = 6;

/** 60 → "1:00", 42 → "0:42" */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Only the digits of what was typed or pasted, Arabic-Indic ones converted */
function digitsOf(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, "");
}

/**
 * «أدخل الرمز»: six boxes in one LTR group (paste or autofill fills them all, Arabic-Indic digits accepted), the
 * resend wait as m:ss, «تغيير الرقم», and any error under the boxes. The parent submits when all six are filled.
 */
export function CodeStep({
  phoneDisplay,
  whatsapp,
  digits,
  onDigitsChange,
  error,
  wrongCode,
  verifying,
  resendIn,
  resending,
  onResend,
  onChangeNumber,
}: {
  /** The number the code went to, masked, e.g. "+962 7•••••67" */
  phoneDisplay: string;
  whatsapp: boolean;
  /** Six entries, "" for an empty box */
  digits: string[];
  onDigitsChange: (next: string[]) => void;
  error: string;
  /** The last code was wrong: the boxes turn red until the member types again */
  wrongCode: boolean;
  verifying: boolean;
  resendIn: number;
  resending: boolean;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focusBox = useCallback((i: number) => {
    const el = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  }, []);

  // Start on the first box
  useEffect(() => {
    focusBox(0);
  }, [focusBox]);
  // After an error (a wrong code clears the boxes), back to the first empty box; typing clears the error
  useEffect(() => {
    if (!error || verifying) return;
    const firstEmpty = digits.findIndex((d) => !d);
    focusBox(firstEmpty === -1 ? CODE_LENGTH - 1 : firstEmpty);
  }, [error, verifying, digits, focusBox]);

  /** Write `ds` into the boxes from `start` (a paste of the whole code always starts at the first box) */
  function fill(start: number, ds: string) {
    const from = ds.length >= CODE_LENGTH ? 0 : start;
    const next = [...digits];
    for (let k = 0; k < ds.length && from + k < CODE_LENGTH; k++) next[from + k] = ds[k];
    onDigitsChange(next);
    focusBox(Math.min(from + ds.length, CODE_LENGTH - 1));
  }

  function onChange(i: number, raw: string) {
    const ds = digitsOf(raw);
    if (!ds) {
      const next = [...digits];
      next[i] = "";
      onDigitsChange(next);
      return;
    }
    // A digit typed next to the box's old one keeps the new one; more digits are an autofilled code
    if (ds.length === 2 && digits[i]) fill(i, ds[0] === digits[i] ? ds[1] : ds[0]);
    else fill(i, ds);
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      onDigitsChange(next);
      focusBox(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onChangeNumber}
        className="-ms-1 mb-3 inline-flex min-h-11 items-center gap-1 text-body font-semibold text-primary hover:underline underline-offset-4"
      >
        <ChevronRight className="size-5" aria-hidden />
        رجوع
      </button>
      <h1 className="font-display text-display-sm text-ink">أدخل الرمز</h1>
      <p className="mt-1 mb-5 text-body text-muted-ink">
        أرسلنا رمزاً من 6 أرقام {channelWords(whatsapp)} إلى{" "}
        <bdi dir="ltr" className="whitespace-nowrap text-ink">
          {phoneDisplay}
        </bdi>
      </p>

      <div
        role="group"
        aria-label="رمز التحقق"
        aria-describedby={error ? "auth-code-error" : undefined}
        dir="ltr"
        className="flex justify-center gap-2"
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`الرقم ${i + 1} من ${CODE_LENGTH}`}
            aria-invalid={wrongCode ? true : undefined}
            value={d}
            disabled={verifying}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => {
              const ds = digitsOf(e.clipboardData.getData("text"));
              e.preventDefault();
              if (ds) fill(i, ds);
            }}
            className={cn(
              "h-14 w-full min-w-0 max-w-[54px] flex-1 rounded-xl border bg-card text-center text-title font-bold text-ink outline-none transition-colors focus:border-2 focus:border-primary disabled:opacity-60",
              wrongCode ? "border-2 border-destructive text-destructive" : "border-border",
            )}
          />
        ))}
      </div>

      {error && (
        <p id="auth-code-error" role="alert" className="mt-3 text-center text-label text-destructive">
          {error}
        </p>
      )}
      {verifying && (
        <p role="status" className="mt-3 flex items-center justify-center gap-2 text-label font-normal text-muted-ink">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          جارٍ التحقق…
        </p>
      )}

      {whatsapp && (
        <p className="mt-4 flex items-center gap-3 rounded-xl bg-card px-4 py-2.5 text-label font-normal text-muted-ink">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Check className="size-4" aria-hidden />
          </span>
          وصل الرمز عبر واتساب
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        {resendIn > 0 ? (
          <span className="inline-flex min-h-11 items-center text-label font-normal text-muted-ink">
            إعادة الإرسال بعد&nbsp;<bdi dir="ltr">{formatWait(resendIn)}</bdi>
          </span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={resending || verifying}
            className="inline-flex min-h-11 items-center gap-2 text-label font-bold text-primary hover:underline underline-offset-4 disabled:opacity-60"
          >
            {resending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            إعادة إرسال الرمز
          </button>
        )}
        <button
          type="button"
          onClick={onChangeNumber}
          className="inline-flex min-h-11 items-center text-label font-bold text-primary hover:underline underline-offset-4"
        >
          تغيير الرقم
        </button>
      </div>
    </div>
  );
}
