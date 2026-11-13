"use client";

import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/shared/number-input";
import { BirthDateSelect } from "@/components/profile/birth-date-select";
import { ChoiceGroup, Field } from "@/components/profile/form-fields";
import { countryConfig } from "@/lib/countries";
import { areasFor } from "@/lib/countries/places";
import type { EditCtx, EditField } from "@/lib/profile-edit-fields";
import { isEmptyStored } from "@/lib/profile-edit-split";
import { nationalityOptions } from "@/lib/profile-options";
import { VEIL_CHOICES, veilChoice, veilFromChoice, type VeilChoice } from "@/lib/profile-veil";
import { dateOfBirthError } from "@/lib/validations/profile";
import { cn } from "@/lib/utils";

/**
 * One profile field's control, shared by the edit list's row editor and the sign-up setup. The values are the
 * row's keys (the field and its companions: area, niqab, prefAgeMax) in the controls' string forms (`initialDraft`);
 * `toPatch` turns them back into stored values.
 */

export type Values = Record<string, unknown>;

/** The job choice that opens a free-text box; the typed job is stored in `job` itself */
export const OTHER_JOB = "أخرى";

export const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dayOf = (v: unknown) => str(v).slice(0, 10);
const toNumber = (v: unknown) => (str(v) === "" ? null : Number(str(v)));

/** The row's keys: the field and the stored keys saved with it */
export const rowKeys = (field: EditField) => [field.key, ...(field.companions ?? [])];

/** The control values a row starts with: the values shown, in the controls' string forms */
export function initialDraft(field: EditField, shown: Values): Values {
  const draft: Values = {};
  for (const key of rowKeys(field)) {
    const v = shown[key];
    if (field.control === "multi") draft[key] = Array.isArray(v) ? v : [];
    else if (field.control === "date") draft[key] = dayOf(v);
    else if (key === "hijab" || key === "niqab" || field.control === "yesNo") draft[key] = typeof v === "boolean" ? v : null;
    else draft[key] = str(v) || (key === field.key ? (field.storedDefault ?? "") : "");
  }
  return draft;
}

/** Whether a stored job is a typed one («أخرى» with its text), not one of the options */
export function isOtherJob(field: EditField, shown: Values, ctx: EditCtx): boolean {
  return field.key === "job" && !!str(shown.job) && !(field.options?.(ctx) ?? []).some((o) => o.value === str(shown.job));
}

/** A row's checks: the message, or null. `jobOther`: «أخرى» is chosen, so the typed job must not be empty. */
export function checkDraft(field: EditField, draft: Values, label: string, jobOther: boolean, country: string): string | null {
  const v = draft[field.key];
  const missing = isEmptyStored(v) || (field.control === "yesNo" && typeof v !== "boolean");
  if (field.key === "prefAgeMin") {
    const lo = toNumber(draft.prefAgeMin);
    const hi = toNumber(draft.prefAgeMax);
    if (lo === null || hi === null) return "يرجى إدخال العمر الأدنى والأقصى";
    const max = field.max ?? 70;
    if (lo < (field.min ?? 18) || hi > max || lo > max || hi < (field.min ?? 18)) return `العمر يجب أن يكون بين ${field.min ?? 18} و${max}`;
    if (lo > hi) return "العمر الأدنى يجب أن يكون أقل من العمر الأقصى";
    return null;
  }
  if (field.key === "job" && jobOther && !str(v).trim()) return "يرجى تحديد الوظيفة";
  if (field.required && missing) return `${label} ${field.fem ? "مطلوبة" : "مطلوب"}`;
  if (field.control === "date" && !missing) return dateOfBirthError(str(v));
  if (field.control === "number" && !missing) {
    const n = Number(v);
    const unit = field.unit ? ` ${field.unit(country)}` : "";
    if (field.min !== undefined && field.max !== undefined && (n < field.min || n > field.max)) {
      return `${label} يجب أن يكون بين ${field.min} و${field.max}${unit}`;
    }
  }
  return null;
}

/** The control values as stored values: numbers as numbers (an empty one is null) */
export function toPatch(field: EditField, draft: Values): Values {
  const patch: Values = {};
  for (const [key, value] of Object.entries(draft)) {
    if (field.control === "number") patch[key] = toNumber(value);
    else patch[key] = value;
  }
  return patch;
}

export interface FieldControlProps {
  /** The control's id; its label is `${id}-label` and its error `${id}-error` (the `Field` convention) */
  id: string;
  field: EditField;
  /** gender, country and the religion switch: the options follow them */
  ctx: EditCtx;
  /** The row's values (`initialDraft` forms) */
  value: Values;
  onChange: (patch: Values) => void;
  /** An error is shown for this row (its text sits under the control, with id `${id}-error`) */
  invalid?: boolean;
  /** Job only: «أخرى» is chosen (the text box shows) */
  jobOther?: boolean;
  onJobOther?: (on: boolean) => void;
  /**
   * Job only, while «أخرى» is chosen: the error about the typed job, shown under its text box (id `${id}-other-error`)
   * instead of marking the whole choice list. The row editor leaves it out and shows its errors itself.
   */
  otherError?: string;
}

/** The control for one field: choice pills, a number, a date, a text, with the row's companions (area, niqab, «أخرى») */
export function FieldControl({ id, field, ctx, value, onChange, invalid = false, jobOther = false, onJobOther, otherError }: FieldControlProps) {
  const { gender, country } = ctx;
  const options = field.options?.(ctx) ?? [];
  const errorProps = invalid ? ({ "aria-invalid": true, "aria-describedby": `${id}-error` } as const) : {};
  const inputClass = "h-12 rounded-xl text-body";

  if (field.key === "hijab") {
    const on = veilChoice(value.hijab as boolean | null, value.niqab as boolean | null);
    return (
      <ChoiceGroup id={id} options={VEIL_CHOICES.map((v) => ({ value: v, label: v }))} isSelected={(v) => v === on} onSelect={(v) => onChange(veilFromChoice(v as VeilChoice))} error={invalid} />
    );
  }
  if (field.key === "prefAgeMin") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-min`} label="من">
          <NumberInput id={`${id}-min`} dir="ltr" className={inputClass} value={str(value.prefAgeMin)} onChange={(e) => onChange({ prefAgeMin: e.target.value })} {...errorProps} />
        </Field>
        <Field id={`${id}-max`} label="إلى">
          <NumberInput id={`${id}-max`} dir="ltr" className={inputClass} value={str(value.prefAgeMax)} onChange={(e) => onChange({ prefAgeMax: e.target.value })} {...errorProps} />
        </Field>
      </div>
    );
  }
  if (field.key === "city") {
    const areas = areasFor(country)[str(value.city)] ?? [];
    return (
      <div className="space-y-4">
        <ChoiceGroup
          id={id}
          options={options}
          isSelected={(v) => v === value.city}
          onSelect={(v) => onChange({ city: v, area: areas.includes(str(value.area)) && v === value.city ? value.area : "" })}
          error={invalid}
        />
        {areas.length > 0 && (
          <Field id={`${id}-area`} label={countryConfig(country).words.area} optional>
            <select
              id={`${id}-area`}
              value={str(value.area)}
              onChange={(e) => onChange({ area: e.target.value })}
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-body focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">اختر {countryConfig(country).words.area}…</option>
              {areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
    );
  }
  if (field.key === "job") {
    const textError = jobOther ? otherError : undefined;
    const textErrorProps = textError ? ({ "aria-invalid": true, "aria-describedby": `${id}-other-error` } as const) : errorProps;
    return (
      <div className="space-y-4">
        <ChoiceGroup
          id={id}
          options={options}
          isSelected={(v) => (jobOther ? v === OTHER_JOB : v === value.job)}
          onSelect={(v) => {
            onJobOther?.(v === OTHER_JOB);
            onChange({ job: v === OTHER_JOB ? "" : v });
          }}
          error={invalid && !textError}
        />
        {jobOther && (
          <Field id={`${id}-other`} label="ما وظيفتك؟" error={textError}>
            <Input id={`${id}-other`} className={inputClass} maxLength={field.max} value={str(value.job)} onChange={(e) => onChange({ job: e.target.value })} {...textErrorProps} />
          </Field>
        )}
      </div>
    );
  }
  if (field.control === "date") {
    return <BirthDateSelect id={id} value={str(value[field.key])} onChange={(v) => onChange({ [field.key]: v })} invalid={invalid} describedBy={invalid ? `${id}-error` : undefined} selectClassName="text-body" />;
  }
  if (field.control === "choice" || field.control === "picker") {
    return <ChoiceGroup id={id} options={options} isSelected={(v) => v === value[field.key]} onSelect={(v) => onChange({ [field.key]: v })} error={invalid} />;
  }
  if (field.control === "yesNo") {
    return (
      <ChoiceGroup id={id} cols={2} options={options} isSelected={(v) => typeof value[field.key] === "boolean" && v === String(value[field.key])} onSelect={(v) => onChange({ [field.key]: v === "true" })} error={invalid} />
    );
  }
  if (field.control === "multi") {
    const list = (value[field.key] as string[]) ?? [];
    return (
      <ChoiceGroup
        id={id}
        multiple
        options={options}
        isSelected={(v) => list.includes(v)}
        onSelect={(v) => onChange({ [field.key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] })}
        error={invalid}
      />
    );
  }
  if (field.control === "number") {
    const unit = field.unit?.(country);
    return (
      <div className="flex items-center gap-3">
        <NumberInput id={id} dir="ltr" className={cn(inputClass, "max-w-40")} value={str(value[field.key])} onChange={(e) => onChange({ [field.key]: e.target.value })} {...errorProps} />
        {unit && <span className="text-label text-muted-ink">{unit}</span>}
      </div>
    );
  }
  if (field.control === "longText") {
    const text = str(value[field.key]);
    return (
      <div className="space-y-1">
        <textarea
          id={id}
          rows={6}
          maxLength={field.max}
          value={text}
          onChange={(e) => onChange({ [field.key]: e.target.value })}
          className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-body leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          {...errorProps}
        />
        {field.max && (
          <p className="text-end text-caption text-muted-ink">
            <bdi>{text.length} / {field.max}</bdi>
          </p>
        )}
      </div>
    );
  }
  const datalist = field.key === "nationality" ? nationalityOptions(gender, country) : null;
  return (
    <>
      <Input
        id={id}
        className={inputClass}
        maxLength={field.max}
        list={datalist ? `${id}-list` : undefined}
        value={str(value[field.key])}
        onChange={(e) => onChange({ [field.key]: e.target.value })}
        {...errorProps}
      />
      {datalist && (
        <datalist id={`${id}-list`}>
          {datalist.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
    </>
  );
}
