"use client";

import { useEffect, useState } from "react";
import {
  birthMonths,
  birthYearOptions,
  changeDobPart,
  daysInMonth,
  isPartialDob,
  joinDob,
  splitDob,
  type DobParts,
} from "@/lib/birth-date";
import { useVisitorCountry } from "@/components/shared/visitor-country";

/**
 * Birth date as day / month / year lists (src/lib/birth-date.ts says why not `type="date"`).
 * `value` / `onChange` carry `YYYY-MM-DD`, or "" while the date is incomplete. `id` goes on the day list
 * so the field's label points at it.
 */
export function BirthDateSelect({
  id,
  value,
  onChange,
  invalid,
  selectClassName = "",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  selectClassName?: string;
}) {
  const country = useVisitorCountry();
  const [parts, setParts] = useState<DobParts>(() => splitDob(value));

  // A value set from outside (profile loaded, draft restored) replaces the lists; our own "" for a partial date doesn't
  useEffect(() => {
    if (value && value !== joinDob(parts)) setParts(splitDob(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only outside changes of `value` matter here
  }, [value]);

  function pick(key: keyof DobParts, v: string) {
    const next = changeDobPart(parts, key, v);
    setParts(next);
    const joined = joinDob(next);
    if (joined !== value) onChange(joined);
  }

  const days = daysInMonth(Number(parts.month), Number(parts.year));
  const partial = isPartialDob(parts);
  const cls = `w-full rounded-lg border bg-background px-1.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
    invalid || partial ? "border-destructive" : "border-input"
  } ${selectClassName}`;

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[0.8fr_2fr_1.1fr] gap-1.5">
        <select id={id} aria-label="اليوم" aria-invalid={invalid || undefined} value={parts.day} onChange={(e) => pick("day", e.target.value)} className={cls}>
          <option value="">يوم</option>
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <option key={d} value={String(d)}>{d}</option>
          ))}
        </select>
        <select aria-label="الشهر" aria-invalid={invalid || undefined} value={parts.month} onChange={(e) => pick("month", e.target.value)} className={cls}>
          <option value="">شهر</option>
          {birthMonths(country).map((name, i) => (
            <option key={name} value={String(i + 1)}>{`${i + 1} - ${name}`}</option>
          ))}
        </select>
        <select aria-label="السنة" aria-invalid={invalid || undefined} value={parts.year} onChange={(e) => pick("year", e.target.value)} className={cls}>
          <option value="">سنة</option>
          {/* a stored year outside the list (older data) still shows instead of a blank list */}
          {parts.year && !birthYearOptions().includes(Number(parts.year)) && <option value={parts.year}>{parts.year}</option>}
          {birthYearOptions().map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
      {partial && <p className="text-xs text-destructive">اختر اليوم والشهر والسنة لإكمال تاريخ الميلاد</p>}
    </div>
  );
}
