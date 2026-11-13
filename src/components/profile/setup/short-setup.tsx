"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/shared/number-input";
import { LoadError } from "@/components/shared/load-error";
import { PageLoading } from "@/components/shared/page-loading";
import { Field } from "@/components/profile/form-fields";
import { BirthDateSelect } from "@/components/profile/birth-date-select";
import { SetupDone } from "@/components/profile/setup/setup-done";
import { COUNTRIES, toCountry, type CountryCode } from "@/lib/countries";
import { editField } from "@/lib/profile-edit-fields";
import { defaultNationality, nationalityOptions, type Opt } from "@/lib/profile-options";
import { missingSetupSteps } from "@/lib/profile-completeness";
import { sectApplies } from "@/lib/profile-sect";
import { forViewer } from "@/lib/gendered-copy";
import { dateOfBirthError, parentInfoSchemaFor, PREF_AGE_MAX } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/phone";
import { toLatinDigits } from "@/lib/digits";
import { sharedGet } from "@/lib/shared-get";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const SINGLE = "أعزب/عزباء";
const PREF_AGE_MIN = 18;
const STEP_NAMES = ["عنك", "حالتك", "من تبحث عنه"];
const GUARDIAN_STEP_NAME = "وليّ الأمر";

const EMPTY_FORM = {
  dateOfBirth: "",
  nationality: "",
  city: "",
  education: "",
  maritalStatus: "",
  childrenCount: "",
  religiosity: "",
  // «المذهب»: Lebanese members only (sectApplies)
  sect: "",
  prefAgeMin: "",
  prefAgeMax: "",
};
type SetupForm = typeof EMPTY_FORM;
type FormKey = keyof SetupForm;

const EMPTY_GUARDIAN = { parentName: "", parentPhone: "", relationship: "", address: "" };
type GuardianForm = typeof EMPTY_GUARDIAN;

const GUARDIAN_RELATIONSHIPS: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "قريب آخر" },
];

/** The stored `setupStep` the legacy wizard reads if the switch goes off: its guardian step is 5 */
const storedStep = (step: number) => (step === 4 ? 5 : step);

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** One pill per option (the mockup's chips), labelled by its Field */
function Chips({
  id,
  options,
  value,
  onSelect,
  invalid,
}: {
  id: string;
  options: Opt[];
  value: string;
  onSelect: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      id={id}
      role="group"
      tabIndex={-1}
      aria-labelledby={`${id}-label`}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn("flex flex-wrap gap-2 outline-none", invalid && "rounded-2xl p-1 ring-1 ring-destructive")}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(o.value)}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              on ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border bg-card font-normal text-ink hover:border-primary/50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The short setup (switch `auth_profile_redesign`): three steps «عنك» / «حالتك» / «من تبحث عنه» with the
 * required fields only, then «ملفك جاهز». It opens on the first step still missing (`missingSetupSteps`), never
 * on the stored `setupStep`. Legacy cycle only (`intro_requests_enabled` off): a fourth guardian step, as today.
 */
export function ShortSetup({ guardianStep }: { guardianStep: boolean }) {
  const router = useRouter();
  const { refreshProfile, profile: me } = useDashboardData();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SetupForm>(EMPTY_FORM);
  const [guardian, setGuardian] = useState<GuardianForm>(EMPTY_GUARDIAN);
  const [shareConsent, setShareConsent] = useState(false);
  const [gender, setGender] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("JO");
  const [ownerId, setOwnerId] = useState("");
  const [fetching, setFetching] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { savedIndicatorVisible, saveToLocalStorage, restoreDraft, clearDraft, saveToServer } = useAutoSave(autoSaveEnabled);

  const country = COUNTRIES[countryCode];
  const sectOn = sectApplies(countryCode);
  const optsCtx = { gender: (gender === "FEMALE" ? "FEMALE" : "MALE") as "MALE" | "FEMALE", country: countryCode };
  const options = (key: string) => editField(key)?.options?.(optsCtx) ?? [];
  const totalSteps = guardianStep ? 4 : 3;
  const stepNames = guardianStep ? [...STEP_NAMES, GUARDIAN_STEP_NAME] : STEP_NAMES;

  const loadProfile = useCallback(async () => {
    setLoadFailed(false);
    setFetching(true);
    let loaded = false;
    try {
      const res = await sharedGet("/api/profile");
      if (!res.ok) throw new Error(`profile ${res.status}`);
      const user = (await res.json())?.user;
      if (!user?.id) throw new Error("profile missing");
      if (user.profile?.isComplete) {
        router.push("/dashboard/profile");
        return;
      }
      const code = toCountry(user.country);
      const p: Record<string, unknown> = user.profile ?? {};
      setOwnerId(user.id);
      setGender(user.gender ?? "");
      setCountryCode(code);
      const next: SetupForm = {
        dateOfBirth: p.dateOfBirth ? new Date(String(p.dateOfBirth)).toISOString().split("T")[0] : "",
        nationality: str(p.nationality) || defaultNationality(user.gender, code),
        city: str(p.city),
        education: str(p.education),
        maritalStatus: str(p.maritalStatus),
        childrenCount: str(p.childrenCount),
        religiosity: str(p.religiosity),
        sect: str(p.sect),
        prefAgeMin: str(p.prefAgeMin),
        prefAgeMax: str(p.prefAgeMax),
      };
      const pi = user.parentInfo;
      const nextGuardian: GuardianForm = pi
        ? { parentName: str(pi.parentName), parentPhone: str(pi.parentPhone), relationship: str(pi.relationship), address: str(pi.address) }
        : EMPTY_GUARDIAN;
      setShareConsent(!!pi?.shareConsentAt);

      // A local draft fresher than the server copy fills the answers (never the step)
      const draft = restoreDraft(user.id);
      const serverTime = p.updatedAt ? new Date(String(p.updatedAt)).getTime() : 0;
      if (draft && new Date(draft.savedAt).getTime() > serverTime) {
        for (const key of Object.keys(EMPTY_FORM) as FormKey[]) {
          const v = draft.form?.[key];
          if (typeof v === "string") next[key] = v;
        }
        for (const key of Object.keys(EMPTY_GUARDIAN) as (keyof GuardianForm)[]) {
          const v = draft.parentForm?.[key];
          if (typeof v === "string") nextGuardian[key] = v;
        }
      }
      setForm(next);
      setGuardian(nextGuardian);
      setStep(missingSetupSteps({ profile: p, country: code })[0]?.step ?? 3);
      loaded = true;
    } catch {
      // Never treat a failed load as an empty profile: saving it would overwrite what is stored
      setLoadFailed(true);
    } finally {
      setFetching(false);
      setAutoSaveEnabled(loaded);
    }
  }, [restoreDraft, router]);
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // The local draft follows every change (debounced in the hook)
  useEffect(() => {
    if (autoSaveEnabled) saveToLocalStorage(form, guardian, storedStep(step), ownerId);
  }, [form, guardian, step, autoSaveEnabled, saveToLocalStorage, ownerId]);

  // Each step and the done screen start at the top
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [step, done]);

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function update(key: FormKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  }

  function updateGuardian(key: keyof GuardianForm, value: string) {
    setGuardian((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  }

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.dateOfBirth) e.dateOfBirth = "تاريخ الميلاد مطلوب";
      else {
        const dobErr = dateOfBirthError(form.dateOfBirth);
        if (dobErr) e.dateOfBirth = dobErr;
      }
      if (!form.nationality.trim()) e.nationality = "الجنسية مطلوبة";
      if (!form.city) e.city = "المدينة مطلوبة";
      if (!form.education) e.education = "المستوى التعليمي مطلوب";
    } else if (s === 2) {
      if (!form.maritalStatus) e.maritalStatus = "الحالة الاجتماعية مطلوبة";
      if (form.maritalStatus && form.maritalStatus !== SINGLE) {
        if (form.childrenCount === "") e.childrenCount = "عدد الأبناء مطلوب";
        else {
          const c = parseInt(form.childrenCount);
          if (!(c >= 0 && c <= 20)) e.childrenCount = "عدد الأبناء يجب أن يكون بين 0 و 20";
        }
      }
      if (!form.religiosity) e.religiosity = "مستوى التدين مطلوب";
      if (sectOn && !form.sect) e.sect = "المذهب مطلوب";
    } else if (s === 3) {
      const range = `بين ${PREF_AGE_MIN} و ${PREF_AGE_MAX}`;
      const min = parseInt(form.prefAgeMin);
      const max = parseInt(form.prefAgeMax);
      if (!form.prefAgeMin) e.prefAgeMin = "العمر الأدنى مطلوب";
      else if (!(min >= PREF_AGE_MIN && min <= PREF_AGE_MAX)) e.prefAgeMin = `العمر الأدنى يجب أن يكون ${range}`;
      if (!form.prefAgeMax) e.prefAgeMax = "العمر الأقصى مطلوب";
      else if (!(max >= PREF_AGE_MIN && max <= PREF_AGE_MAX)) e.prefAgeMax = `العمر الأقصى يجب أن يكون ${range}`;
      if (!e.prefAgeMin && !e.prefAgeMax && min > max) e.prefAgeMin = "العمر الأدنى يجب أن يكون أقل من العمر الأقصى";
    } else if (s === 4) {
      if (!guardian.parentName) e.parentName = "اسم ولي الأمر مطلوب";
      if (!guardian.parentPhone) e.parentPhone = `رقم ${country.words.phone} ولي الأمر مطلوب`;
      if (!guardian.relationship) e.relationship = "صلة القرابة مطلوبة";
      if (!guardian.address) e.address = "العنوان مطلوب";
      // Same rules as the API (the other family sees this contact)
      const parsed = parentInfoSchemaFor(country.code).safeParse({ ...guardian, notes: undefined });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0]);
          if (!e[key]) e[key] = issue.message;
        }
      }
      if (!e.parentPhone && me?.phone && normalizePhone(guardian.parentPhone, country.code) === me.phone) {
        e.parentPhone = `رقم وليّ الأمر يجب أن يختلف عن رقم ${country.words.phone}ك`;
      }
    }
    return e;
  }

  /** The answers so far, empty ones left out (the server keeps what it has) */
  function payload(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (form.dateOfBirth) p.dateOfBirth = form.dateOfBirth;
    if (form.nationality.trim()) p.nationality = form.nationality.trim();
    if (form.city) p.city = form.city;
    if (form.education) p.education = form.education;
    if (form.maritalStatus) {
      p.maritalStatus = form.maritalStatus;
      p.childrenCount = form.maritalStatus === SINGLE ? 0 : form.childrenCount ? parseInt(form.childrenCount) : 0;
    }
    if (form.religiosity) p.religiosity = form.religiosity;
    if (sectOn && form.sect) p.sect = form.sect;
    if (form.prefAgeMin) p.prefAgeMin = parseInt(form.prefAgeMin);
    if (form.prefAgeMax) p.prefAgeMax = parseInt(form.prefAgeMax);
    return p;
  }

  /** Errors under their fields; the first one is brought into view. True when the step is fine. */
  function check(s: number): boolean {
    const e = validate(s);
    setErrors(e);
    setError("");
    const first = Object.keys(e)[0];
    if (!first) return true;
    const el = document.querySelector(`[data-field="${first}"]`);
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    return false;
  }

  function goNext() {
    if (!check(step)) return;
    const nextStep = step + 1;
    saveToServer(storedStep(nextStep), payload());
    setStep(nextStep);
  }

  async function finish() {
    if (!check(step)) return;
    setSaving(true);
    try {
      // Legacy cycle: the guardian first, the profile only counts as complete once it has one (the server checks)
      if (guardianStep) {
        const res = await fetch("/api/profile/parent-info", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...guardian, shareConsent }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "حدث خطأ أثناء حفظ بيانات ولي الأمر");
          return;
        }
      }
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "حدث خطأ أثناء حفظ الملف الشخصي");
        return;
      }
      trackEvent("profile_completed");
      clearDraft();
      // The dashboard's shared profile still holds the pre-setup copy
      await refreshProfile();
      setDone(true);
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setSaving(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="py-12">
        <LoadError message="تعذّر تحميل ملفك. يمكنك التحقق من اتصالك والمحاولة مرة أخرى." onRetry={loadProfile} />
      </div>
    );
  }
  if (fetching) return <PageLoading width="max-w-xl" />;
  if (done) {
    return (
      <div ref={topRef} className="scroll-mt-20">
        <SetupDone gender={gender} />
      </div>
    );
  }

  const heading =
    step === 1
      ? { title: "معلوماتك الأساسية", sub: "أسئلة قليلة فقط، وباقي ملفك اختياري يمكنك إكماله لاحقاً." }
      : step === 2
        ? { title: "حالتك الاجتماعية", sub: forViewer(gender, "تساعدنا على اقتراح من يناسبك.", "تساعدنا على اقتراح من يناسبكِ.") }
        : step === 3
          ? {
              title: forViewer(gender, "من تبحث عنه؟", "من تبحثين عنه؟"),
              sub: "العمر المناسب للطرف الآخر. يمكنك إضافة باقي التفضيلات لاحقاً من «تعديل ملفي».",
            }
          : { title: "بيانات ولي الأمر", sub: "هذه البيانات مطلوبة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين" };
  const last = step === totalSteps;
  const rowClass = "flex min-h-13 items-center gap-3 px-4";
  const rowInput = "h-12 min-w-0 flex-1 bg-transparent text-end text-body text-ink outline-none";

  return (
    <div ref={topRef} className="mx-auto max-w-xl scroll-mt-20 pt-2">
      {/* Progress: one bar per step, with the step names */}
      <div className="mb-6">
        <div className="mb-2 flex gap-1.5" aria-hidden>
          {stepNames.map((name, i) => (
            <span key={name} className={cn("h-1 flex-1 rounded-full", i < step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <ol aria-label="خطوات الإعداد" className="flex justify-between gap-2">
          {stepNames.map((name, i) => (
            <li
              key={name}
              aria-current={i + 1 === step ? "step" : undefined}
              className={cn("text-caption", i + 1 === step ? "font-bold text-primary" : "text-muted-ink")}
            >
              {i + 1}. {name}
            </li>
          ))}
        </ol>
      </div>

      <h1 className="font-display text-display-sm text-ink">{heading.title}</h1>
      <p className="mt-1 mb-6 text-body text-muted-ink">{heading.sub}</p>

      <div className="space-y-6">
        {step === 1 && (
          <>
            <Field id="dateOfBirth" label="تاريخ الميلاد" error={errors.dateOfBirth}>
              <BirthDateSelect id="dateOfBirth" value={form.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} invalid={!!errors.dateOfBirth} />
            </Field>

            <div>
              <p className="mb-1.5 px-1 text-label font-normal text-muted-ink">الجنسية والمدينة</p>
              <div
                className={cn(
                  "overflow-hidden rounded-xl bg-card focus-within:ring-2 focus-within:ring-primary/30",
                  (errors.nationality || errors.city) && "ring-1 ring-destructive",
                )}
              >
                <div data-field="nationality" className={cn(rowClass, "border-b border-border")}>
                  <label htmlFor="nationality" className="shrink-0 text-body text-ink">
                    الجنسية
                  </label>
                  <input
                    id="nationality"
                    list="nationality-options"
                    value={form.nationality}
                    maxLength={100}
                    onChange={(e) => update("nationality", e.target.value)}
                    aria-invalid={!!errors.nationality}
                    aria-describedby={errors.nationality ? "nationality-error" : undefined}
                    className={rowInput}
                  />
                  <datalist id="nationality-options">
                    {nationalityOptions(gender, countryCode).map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div data-field="city" className={rowClass}>
                  <label htmlFor="city" className="shrink-0 text-body text-ink">
                    المدينة
                  </label>
                  <select
                    id="city"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    aria-invalid={!!errors.city}
                    aria-describedby={errors.city ? "city-error" : undefined}
                    className={cn(rowInput, "cursor-pointer", !form.city && "text-muted-ink")}
                  >
                    <option value="">اختر المدينة</option>
                    {options("city").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {errors.nationality && (
                <p id="nationality-error" className="mt-2 px-1 text-caption text-destructive">
                  {errors.nationality}
                </p>
              )}
              {errors.city && (
                <p id="city-error" className="mt-2 px-1 text-caption text-destructive">
                  {errors.city}
                </p>
              )}
            </div>

            <Field id="education" label="المستوى التعليمي" error={errors.education}>
              <Chips id="education" options={options("education")} value={form.education} onSelect={(v) => update("education", v)} invalid={!!errors.education} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field id="maritalStatus" label="الحالة الاجتماعية" error={errors.maritalStatus}>
              <Chips
                id="maritalStatus"
                options={options("maritalStatus")}
                value={form.maritalStatus}
                onSelect={(v) => {
                  update("maritalStatus", v);
                  if (v === SINGLE) update("childrenCount", "0");
                }}
                invalid={!!errors.maritalStatus}
              />
            </Field>

            {form.maritalStatus && form.maritalStatus !== SINGLE && (
              <Field id="childrenCount" label="عدد الأبناء" error={errors.childrenCount}>
                <NumberInput
                  id="childrenCount"
                  value={form.childrenCount}
                  onChange={(e) => update("childrenCount", e.target.value)}
                  placeholder="0"
                  min={0}
                  max={20}
                  dir="ltr"
                  aria-invalid={!!errors.childrenCount}
                  className={cn("h-12 max-w-32 text-body", errors.childrenCount && "border-destructive")}
                />
              </Field>
            )}

            <Field id="religiosity" label="مستوى التدين" error={errors.religiosity}>
              <Chips id="religiosity" options={options("religiosity")} value={form.religiosity} onSelect={(v) => update("religiosity", v)} invalid={!!errors.religiosity} />
            </Field>

            {sectOn && (
              <Field id="sect" label="المذهب" error={errors.sect}>
                <Chips id="sect" options={options("sect")} value={form.sect} onSelect={(v) => update("sect", v)} invalid={!!errors.sect} />
              </Field>
            )}
          </>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-4">
            <Field id="prefAgeMin" label="العمر الأدنى" error={errors.prefAgeMin}>
              <NumberInput
                id="prefAgeMin"
                value={form.prefAgeMin}
                onChange={(e) => update("prefAgeMin", e.target.value)}
                placeholder={String(PREF_AGE_MIN)}
                min={PREF_AGE_MIN}
                max={PREF_AGE_MAX}
                dir="ltr"
                aria-invalid={!!errors.prefAgeMin}
                className={cn("h-12 text-body", errors.prefAgeMin && "border-destructive")}
              />
            </Field>
            <Field id="prefAgeMax" label="العمر الأقصى" error={errors.prefAgeMax}>
              <NumberInput
                id="prefAgeMax"
                value={form.prefAgeMax}
                onChange={(e) => update("prefAgeMax", e.target.value)}
                placeholder="40"
                min={PREF_AGE_MIN}
                max={PREF_AGE_MAX}
                dir="ltr"
                aria-invalid={!!errors.prefAgeMax}
                className={cn("h-12 text-body", errors.prefAgeMax && "border-destructive")}
              />
            </Field>
          </div>
        )}

        {step === 4 && (
          <>
            <Field id="parentName" label="اسم ولي الأمر" error={errors.parentName}>
              <Input
                id="parentName"
                value={guardian.parentName}
                onChange={(e) => updateGuardian("parentName", e.target.value)}
                placeholder="الاسم الكامل لولي الأمر"
                aria-invalid={!!errors.parentName}
                className={cn("h-12 text-body", errors.parentName && "border-destructive")}
              />
            </Field>
            <Field id="parentPhone" label={`رقم ${country.words.phone} ولي الأمر`} error={errors.parentPhone}>
              <bdi className="block">
                <Input
                  id="parentPhone"
                  type="tel"
                  inputMode="tel"
                  value={guardian.parentPhone}
                  onChange={(e) => updateGuardian("parentPhone", toLatinDigits(e.target.value))}
                  placeholder={`0${country.phone.placeholder}`}
                  dir="ltr"
                  aria-invalid={!!errors.parentPhone}
                  className={cn("h-12 text-left text-body", errors.parentPhone && "border-destructive")}
                />
              </bdi>
            </Field>
            <Field id="relationship" label="صلة القرابة" error={errors.relationship}>
              <Chips
                id="relationship"
                options={GUARDIAN_RELATIONSHIPS}
                value={guardian.relationship}
                onSelect={(v) => updateGuardian("relationship", v)}
                invalid={!!errors.relationship}
              />
            </Field>
            <Field id="address" label="العنوان" error={errors.address}>
              <textarea
                id="address"
                value={guardian.address}
                onChange={(e) => updateGuardian("address", e.target.value)}
                aria-invalid={!!errors.address}
                placeholder="العنوان التفصيلي (المدينة، الحي، الشارع...)"
                className={cn(
                  "min-h-20 w-full resize-none rounded-lg border bg-background px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-ring",
                  errors.address ? "border-destructive" : "border-input",
                )}
              />
            </Field>
            <p className="rounded-xl bg-primary/5 p-3 text-label font-normal text-muted-ink">
              هذه البيانات سرية وتستخدم فقط من قبل الإدارة لتنسيق الزيارات العائلية
            </p>
          </>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-6 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-label font-normal text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Sticky above the tab bar on phones, so «التالي» never scrolls away */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mt-8 flex items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
        {step > 1 && (
          <Button
            type="button"
            variant="ghost"
            className="h-12 px-3 text-body"
            onClick={() => {
              setErrors({});
              setError("");
              setStep(step - 1);
            }}
          >
            <ChevronRight className="size-4" aria-hidden />
            السابق
          </Button>
        )}
        <div role="status" className="min-w-0 flex-1 text-caption text-muted-ink">
          {savedIndicatorVisible && (
            <span className="inline-flex animate-appear items-center gap-1">
              <Check className="size-3.5" aria-hidden />
              حُفظ تلقائياً
            </span>
          )}
        </div>
        {last ? (
          <Button type="button" className="h-12 min-w-40 text-body" disabled={saving} onClick={finish}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-label="جارٍ الحفظ" /> : "حفظ والبدء"}
          </Button>
        ) : (
          <Button type="button" className="h-12 min-w-40 text-body" onClick={goNext}>
            التالي
          </Button>
        )}
      </div>
    </div>
  );
}
