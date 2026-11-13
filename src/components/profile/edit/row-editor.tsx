"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NumberInput } from "@/components/shared/number-input";
import { BirthDateSelect } from "@/components/profile/birth-date-select";
import { ChoiceGroup, DealbreakerToggle, Field } from "@/components/profile/form-fields";
import { countryConfig } from "@/lib/countries";
import { areasFor } from "@/lib/countries/places";
import type { EditField, EditShowCtx } from "@/lib/profile-edit-fields";
import { isEmptyStored } from "@/lib/profile-edit-split";
import { nationalityOptions } from "@/lib/profile-options";
import { dealbreakerPrefsFor } from "@/lib/profile-religion";
import { VEIL_CHOICES, veilChoice, veilFromChoice, type VeilChoice } from "@/lib/profile-veil";
import { activeDealbreakers } from "@/lib/matching/dealbreaker-summary";
import { dateOfBirthError } from "@/lib/validations/profile";
import { forViewer } from "@/lib/gendered-copy";
import { cn } from "@/lib/utils";

type Values = Record<string, unknown>;

const SINGLE = "أعزب/عزباء";
const OTHER_JOB = "أخرى";
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** `md:` and up: the editor is a dialog; below, a bottom sheet */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dayOf = (v: unknown) => str(v).slice(0, 10);
const toNumber = (v: unknown) => (str(v) === "" ? null : Number(str(v)));

/** The row's keys: the field and the stored keys saved with it */
export const rowKeys = (field: EditField) => [field.key, ...(field.companions ?? [])];

/** Whether a change to this row goes to review: a stored answer (a `storedDefault` always holds one), never a preference */
export function needsReview(field: EditField, stored: Values): boolean {
  if (field.key.startsWith("pref")) return false;
  return field.storedDefault !== undefined || rowKeys(field).some((k) => !isEmptyStored(stored[k]));
}

/** The draft the editor opens with: the values shown, in the controls' string forms */
function initialDraft(field: EditField, shown: Values): Values {
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

/** The checks run on «تم»: the message, or null */
function checkDraft(field: EditField, draft: Values, label: string, jobOther: boolean, country: string): string | null {
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

/** The draft as stored values: numbers as numbers (an empty one is null) */
function toPatch(field: EditField, draft: Values): Values {
  const patch: Values = {};
  for (const [key, value] of Object.entries(draft)) {
    if (field.control === "number") patch[key] = toNumber(value);
    else patch[key] = value;
  }
  return patch;
}

export interface RowEditorProps {
  field: EditField;
  /** gender, country, religion switch and the values shown (stored + unsaved changes) */
  ctx: EditShowCtx;
  stored: Values;
  /** The «شرط أساسي» keys ticked now (shown when `showDealbreakers`) */
  dealbreakers: string[];
  showDealbreakers: boolean;
  onClose: () => void;
  /** «تم»: the row's new values and, for a preference with a «شرط أساسي», whether it is ticked */
  onDone: (patch: Values, dealbreakerTicked?: boolean) => void;
}

/**
 * One row's editor: a dialog on `md:` and up, a bottom sheet on phones. «تم» changes nothing on the server: it
 * hands the row's values back to the list, which marks the row. Errors show under the control.
 */
export function RowEditor({ field, ctx, stored, dealbreakers, showDealbreakers, onClose, onDone }: RowEditorProps) {
  const desktop = useDesktop();
  const { gender, country } = ctx;
  const label = field.label(gender, country);
  const id = `edit-${field.key}`;
  const [draft, setDraft] = useState<Values>(() => initialDraft(field, ctx.profile));
  const options = field.options?.(ctx) ?? [];
  const [jobOther, setJobOther] = useState(
    () => field.key === "job" && !!str(ctx.profile.job) && !options.some((o) => o.value === str(ctx.profile.job)),
  );
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState(() => !!field.dealbreaker && dealbreakers.includes(field.dealbreaker));
  const set = (patch: Values) => {
    setError("");
    setDraft((d) => ({ ...d, ...patch }));
  };
  const profile = { ...ctx.profile, ...toPatch(field, draft) };
  const religion = profile.religion as string | null | undefined;
  const hints = field.hints?.({ ...ctx, profile, dealbreakers: activeDealbreakers(dealbreakers, dealbreakerPrefsFor(religion, profile), gender) }) ?? [];
  const dealbreakerKey = showDealbreakers ? field.dealbreaker : undefined;
  const dealbreakerOff = !dealbreakerKey || activeDealbreakers([dealbreakerKey], dealbreakerPrefsFor(religion, profile), gender).length === 0;

  function done() {
    const issue = checkDraft(field, draft, label, jobOther, country);
    if (issue) {
      setError(issue);
      return;
    }
    const patch = toPatch(field, draft);
    // Single: no children (as the legacy edit page)
    if (field.key === "maritalStatus" && patch.maritalStatus === SINGLE) patch.childrenCount = 0;
    onDone(patch, dealbreakerKey ? ticked && !dealbreakerOff : undefined);
  }

  const invalid = !!error;
  const errorProps = invalid ? ({ "aria-invalid": true, "aria-describedby": `${id}-error` } as const) : {};
  const inputClass = "h-12 rounded-xl text-body";

  let control: ReactNode;
  if (field.key === "hijab") {
    const on = veilChoice(draft.hijab as boolean | null, draft.niqab as boolean | null);
    control = (
      <ChoiceGroup id={id} options={VEIL_CHOICES.map((v) => ({ value: v, label: v }))} isSelected={(v) => v === on} onSelect={(v) => set(veilFromChoice(v as VeilChoice))} error={invalid} />
    );
  } else if (field.key === "prefAgeMin") {
    control = (
      <div className="grid grid-cols-2 gap-3">
        <Field id={`${id}-min`} label="من">
          <NumberInput id={`${id}-min`} dir="ltr" className={inputClass} value={str(draft.prefAgeMin)} onChange={(e) => set({ prefAgeMin: e.target.value })} {...errorProps} />
        </Field>
        <Field id={`${id}-max`} label="إلى">
          <NumberInput id={`${id}-max`} dir="ltr" className={inputClass} value={str(draft.prefAgeMax)} onChange={(e) => set({ prefAgeMax: e.target.value })} {...errorProps} />
        </Field>
      </div>
    );
  } else if (field.key === "city") {
    const areas = areasFor(country)[str(draft.city)] ?? [];
    control = (
      <div className="space-y-4">
        <ChoiceGroup
          id={id}
          options={options}
          isSelected={(v) => v === draft.city}
          onSelect={(v) => set({ city: v, area: areas.includes(str(draft.area)) && v === draft.city ? draft.area : "" })}
          error={invalid}
        />
        {areas.length > 0 && (
          <Field id={`${id}-area`} label={countryConfig(country).words.area} optional>
            <select
              id={`${id}-area`}
              value={str(draft.area)}
              onChange={(e) => set({ area: e.target.value })}
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
  } else if (field.key === "job") {
    control = (
      <div className="space-y-4">
        <ChoiceGroup
          id={id}
          options={options}
          isSelected={(v) => (jobOther ? v === OTHER_JOB : v === draft.job)}
          onSelect={(v) => {
            setJobOther(v === OTHER_JOB);
            set({ job: v === OTHER_JOB ? "" : v });
          }}
          error={invalid}
        />
        {jobOther && (
          <Field id={`${id}-other`} label="ما وظيفتك؟">
            <Input id={`${id}-other`} className={inputClass} maxLength={field.max} value={str(draft.job)} onChange={(e) => set({ job: e.target.value })} {...errorProps} />
          </Field>
        )}
      </div>
    );
  } else if (field.control === "date") {
    control = <BirthDateSelect id={id} value={str(draft[field.key])} onChange={(v) => set({ [field.key]: v })} invalid={invalid} describedBy={invalid ? `${id}-error` : undefined} selectClassName="text-body" />;
  } else if (field.control === "choice" || field.control === "picker") {
    control = <ChoiceGroup id={id} options={options} isSelected={(v) => v === draft[field.key]} onSelect={(v) => set({ [field.key]: v })} error={invalid} />;
  } else if (field.control === "yesNo") {
    control = (
      <ChoiceGroup id={id} cols={2} options={options} isSelected={(v) => typeof draft[field.key] === "boolean" && v === String(draft[field.key])} onSelect={(v) => set({ [field.key]: v === "true" })} error={invalid} />
    );
  } else if (field.control === "multi") {
    const list = (draft[field.key] as string[]) ?? [];
    control = (
      <ChoiceGroup
        id={id}
        multiple
        options={options}
        isSelected={(v) => list.includes(v)}
        onSelect={(v) => set({ [field.key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] })}
        error={invalid}
      />
    );
  } else if (field.control === "number") {
    const unit = field.unit?.(country);
    control = (
      <div className="flex items-center gap-3">
        <NumberInput id={id} dir="ltr" className={cn(inputClass, "max-w-40")} value={str(draft[field.key])} onChange={(e) => set({ [field.key]: e.target.value })} {...errorProps} />
        {unit && <span className="text-label text-muted-ink">{unit}</span>}
      </div>
    );
  } else if (field.control === "longText") {
    const text = str(draft[field.key]);
    control = (
      <div className="space-y-1">
        <textarea
          id={id}
          rows={6}
          maxLength={field.max}
          value={text}
          onChange={(e) => set({ [field.key]: e.target.value })}
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
  } else {
    const datalist = field.key === "nationality" ? nationalityOptions(gender, country) : null;
    control = (
      <>
        <Input
          id={id}
          className={inputClass}
          maxLength={field.max}
          list={datalist ? `${id}-list` : undefined}
          value={str(draft[field.key])}
          onChange={(e) => set({ [field.key]: e.target.value })}
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

  const body = (
    <div className="space-y-4">
      {needsReview(field, stored) && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-label font-normal leading-relaxed text-amber-800">
          <Clock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          تغيير {label} يُرسل لفريق نصيبك للمراجعة قبل ظهوره.
        </p>
      )}
      <p id={`${id}-label`} className="sr-only">{label}</p>
      {control}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      )}
      {hints.map((h) => (
        <p key={h} className="text-label font-normal leading-relaxed text-muted-ink">{h}</p>
      ))}
      {dealbreakerKey && (
        <div className="flex flex-wrap items-center gap-2">
          <DealbreakerToggle id={id} checked={ticked} disabled={dealbreakerOff} onChange={setTicked} />
          <span className="text-caption text-muted-ink">{forViewer(gender, "لن نقترح عليك من لا يحققه.", "لن نقترح عليكِ من لا يحققه.")}</span>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="button" className="h-12 flex-1 rounded-xl font-semibold" onClick={done}>
          تم
        </Button>
        <Button type="button" variant="outline" className="h-12 w-28 rounded-xl" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
  );

  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  if (desktop) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto rounded-card sm:max-w-lg">
          <DialogTitle className="text-headline font-bold text-ink">{label}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto rounded-t-sheet px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <SheetTitle className="text-headline font-bold text-ink">{label}</SheetTitle>
        {body}
      </SheetContent>
    </Sheet>
  );
}
