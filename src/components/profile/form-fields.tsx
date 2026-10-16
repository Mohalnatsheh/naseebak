"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { Opt } from "@/lib/profile-options";

/** "(اختياري)" next to a label. */
export function OptionalTag() {
  return <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>;
}

/**
 * One wizard field: label linked to its control (`htmlFor` = `id` for inputs,
 * `aria-labelledby` = `${id}-label` for button groups), error under it.
 */
export function Field({
  id,
  label,
  optional,
  hint,
  error,
  aside,
  children,
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2" data-field={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} id={`${id}-label`} className="flex-wrap">
          {label} {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>} {optional && <OptionalTag />}
        </Label>
        {aside}
      </div>
      {children}
      {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Button group for single or multiple choice, labelled by its Field. */
export function ChoiceGroup({
  id,
  options,
  isSelected,
  onSelect,
  cols = 3,
  error,
  multiple,
}: {
  id: string;
  options: Opt[];
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
  cols?: 2 | 3 | 4;
  error?: boolean;
  multiple?: boolean;
}) {
  const grid = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3";
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-invalid={error || undefined}
      className={`grid ${grid} gap-2 ${error ? "ring-1 ring-destructive rounded-xl p-1" : ""}`}
    >
      {options.map((o) => {
        const on = isSelected(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(o.value)}
            className={`rounded-xl border px-3 py-2 text-sm transition-all ${on ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
          >
            {o.label}
            {multiple && <span className="sr-only">{on ? " (مختار)" : ""}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "شرط أساسي" chip next to a partner preference: suggestions must meet it. */
export function DealbreakerToggle({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={`${id}-dealbreaker`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        disabled
          ? "cursor-not-allowed border-border/50 text-muted-foreground/60"
          : checked
            ? "cursor-pointer border-accent bg-accent/15 font-semibold text-foreground"
            : "cursor-pointer border-border text-muted-foreground hover:border-accent/60"
      }`}
      title={disabled ? "اختر تفضيلاً أولاً" : "لن نقترح عليك من لا يحقق هذا الشرط"}
    >
      <input
        id={`${id}-dealbreaker`}
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-label`}
        className="h-3.5 w-3.5 accent-[var(--accent)]"
      />
      <ShieldCheck className={`h-3.5 w-3.5 ${checked && !disabled ? "text-accent" : ""}`} />
      شرط أساسي
    </label>
  );
}
