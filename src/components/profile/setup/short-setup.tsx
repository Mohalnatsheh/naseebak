"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/shared/load-error";
import { PageLoading } from "@/components/shared/page-loading";
import { DealbreakerToggle, Field } from "@/components/profile/form-fields";
import { FieldControl, checkDraft, initialDraft, isOtherJob, rowKeys, toPatch, type Values } from "@/components/profile/edit/field-control";
import { SetupDone } from "@/components/profile/setup/setup-done";
import { COUNTRIES, toCountry, type CountryCode } from "@/lib/countries";
import { editField, rowKeyOf, type EditCtx, type EditField, type EditShowCtx } from "@/lib/profile-edit-fields";
import { isEmptyStored } from "@/lib/profile-edit-split";
import { dealbreakerKeysToSave, sendableChanges } from "@/lib/profile-edit-state";
import { firstIncompleteStep, missingOnStep, setupRequired, setupSteps, type SetupStep, type SetupStepId } from "@/lib/setup-steps";
import { defaultNationality, type Opt } from "@/lib/profile-options";
import { dealbreakerPrefsFor } from "@/lib/profile-religion";
import { activeDealbreakers, dealbreakerSummary, type DealbreakerPrefs } from "@/lib/matching/dealbreaker-summary";
import type { DealbreakerKey } from "@/lib/matching/score";
import { forViewer } from "@/lib/gendered-copy";
import { FixedBottomBar } from "@/components/profile/fixed-bottom-bar";
import { parentInfoSchemaFor } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/phone";
import { toLatinDigits } from "@/lib/digits";
import { sharedGet } from "@/lib/shared-get";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const SINGLE = "أعزب/عزباء";

const EMPTY_GUARDIAN = { parentName: "", parentPhone: "", relationship: "", address: "" };
type GuardianForm = typeof EMPTY_GUARDIAN;

const GUARDIAN_RELATIONSHIPS: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "قريب آخر" },
];

/**
 * The stored `setupStep` (1–5, the draft API's range) is the legacy wizard's step, read if the switch goes off:
 * 1 basics and work, 2 religion and life, 3 about me and preferences, 4 family, 5 guardian.
 */
const LEGACY_STEP: Record<SetupStepId, number> = { you: 1, faith: 2, work: 1, family: 4, about: 3, looking: 3, musts: 3 };
const GUARDIAN_LEGACY_STEP = 5;
/** Step `i` (past the last: the guardian) as the stored `setupStep` */
const storedStep = (steps: SetupStep[], i: number) => (i >= steps.length ? GUARDIAN_LEGACY_STEP : LEGACY_STEP[steps[i].id]);

/** Every field the steps ask, in step order */
const SETUP_FIELDS: EditField[] = setupSteps({ dealbreakers: false })
  .flatMap((s) => s.fieldKeys)
  .map((key) => editField(key))
  .filter((f): f is EditField => !!f);
const LOOKING_FIELDS: EditField[] = setupSteps({ dealbreakers: false })
  .find((s) => s.id === "looking")!
  .fieldKeys.map((key) => editField(key))
  .filter((f): f is EditField => !!f);

/** The form a stored profile opens with, in the controls' forms */
function formFromProfile(p: Values, gender: string, country: CountryCode): Values {
  const form: Values = {};
  for (const field of SETUP_FIELDS) Object.assign(form, initialDraft(field, p));
  // «الديانة» has no preselected answer in setup (the edit list reads a stored null as «مسلم»)
  if (isEmptyStored(p.religion)) form.religion = "";
  if (!form.nationality) form.nationality = defaultNationality(gender, country);
  return form;
}

/** A draft value of the same shape as the form's (an old or foreign draft never breaks a control) */
function sameShape(current: unknown, v: unknown): boolean {
  if (Array.isArray(current)) return Array.isArray(v) && v.every((x) => typeof x === "string");
  if (typeof current === "string") return typeof v === "string";
  return v === null || typeof v === "boolean";
}

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

/** Stored as free text in both setup schemas (shortText / longText), so "" clears them */
const CLEARABLE_TEXT = new Set(["area", "prefHijab", "prefBeard", "prefChildrenAcceptance"]);
const isTextControl = (field: EditField) => field.control === "text" || field.control === "longText";

/** The sub-line under each step's title */
function stepSub(id: SetupStepId, gender: string): string {
  switch (id) {
    case "you":
      return forViewer(gender, "بياناتك الأساسية كما تظهر لمن يُقترح عليك.", "بياناتكِ الأساسية كما تظهر لمن يُقترح عليكِ.");
    case "faith":
      return forViewer(gender, "تساعدنا على اقتراح من يناسبك.", "تساعدنا على اقتراح من يناسبكِ.");
    case "work":
      return forViewer(gender, "دراستك وعملك.", "دراستكِ وعملكِ.");
    case "family":
      return forViewer(gender, "عائلتك وسكنك.", "عائلتكِ وسكنكِ.");
    case "about":
      return forViewer(gender, "بكلماتك. كلها اختيارية، ويمكنك إكمالها لاحقاً.", "بكلماتكِ. كلها اختيارية، ويمكنكِ إكمالها لاحقاً.");
    case "looking":
      return forViewer(gender, "العمر مطلوب، وباقي التفضيلات اختياري.", "العمر مطلوب، وباقي التفضيلات اختياري.");
    case "musts":
      return forViewer(gender, "اختر ما لا تقبل غيره. يمكنك تغييره لاحقاً من «تعديل ملفي».", "اختاري ما لا تقبلين غيره. يمكنكِ تغييره لاحقاً من «تعديل ملفي».");
  }
}

/**
 * The sign-up setup (switch `auth_profile_redesign`): every profile field in 7 steps (6 where the legacy shows no
 * «شروط أساسية», `flags.mutualSuggestions`), driven by the edit field table through `setupSteps`, then «ملفك جاهز».
 * It opens on the first step with a required answer missing (`firstIncompleteStep`), never on the stored
 * `setupStep`. Legacy cycle only (`intro_requests_enabled` off): a last guardian step, as before.
 * Spec: docs/superpowers/specs/2026-11-14-full-setup-design.md.
 */
export function ShortSetup({ guardianStep }: { guardianStep: boolean }) {
  const router = useRouter();
  const { refreshProfile, profile: me, counts, loading: dataLoading } = useDashboardData();
  // «الديانة»: asked only while the switch is on (from /api/me/counts)
  const religionEnabled = counts?.religionEnabled === true;
  // «شروط أساسية»: only where the legacy setup shows them (new suggestions flow)
  const dealbreakersOn = counts?.flags?.mutualSuggestions === true;
  // The step list and «الديانة» wait for /api/me/counts
  const countsKnown = !!counts;
  const steps = useMemo(() => setupSteps({ dealbreakers: dealbreakersOn }), [dealbreakersOn]);
  const [step, setStep] = useState(0);
  // The highest `setupStep` stored or sent: it never goes back (the legacy wizard resumes from it)
  const highestStored = useRef(0);
  // The answers the server holds (as loaded, plus what the autosave sent since): an emptied one is sent as cleared
  const serverValues = useRef<Values>({});
  const [form, setForm] = useState<Values>({});
  const [stored, setStored] = useState<Values>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [jobOther, setJobOther] = useState(false);
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
  // What the final save sent: «ملفك جاهز» lists only what is still empty
  const [savedProfile, setSavedProfile] = useState<Values | undefined>(undefined);
  const { savedIndicatorVisible, saveToLocalStorage, restoreDraft, clearDraft, saveToServer } = useAutoSave(autoSaveEnabled);

  const country = COUNTRIES[countryCode];
  const ctx: EditCtx = useMemo(
    () => ({ gender: gender === "FEMALE" ? "FEMALE" : "MALE", country: countryCode, religionEnabled }),
    [gender, countryCode, religionEnabled],
  );
  const showCtx: EditShowCtx = { ...ctx, profile: form };
  const totalSteps = steps.length + (guardianStep ? 1 : 0);
  const onGuardian = guardianStep && step === steps.length;
  const current: SetupStep | undefined = steps[step];

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
      const userGender = String(user.gender ?? "");
      const p: Values = user.profile ?? {};
      const loadCtx: EditCtx = { gender: userGender === "FEMALE" ? "FEMALE" : "MALE", country: code, religionEnabled };
      setOwnerId(user.id);
      setGender(userGender);
      setCountryCode(code);
      setStored(p);
      highestStored.current = typeof p.setupStep === "number" ? p.setupStep : 0;
      serverValues.current = { ...p };
      setTicked(Array.isArray(p.dealbreakers) ? p.dealbreakers.map(String) : []);
      const fromServer = formFromProfile(p, userGender, code);
      const next = { ...fromServer };
      const pi = user.parentInfo;
      const nextGuardian: GuardianForm = pi
        ? { parentName: String(pi.parentName ?? ""), parentPhone: String(pi.parentPhone ?? ""), relationship: String(pi.relationship ?? ""), address: String(pi.address ?? "") }
        : EMPTY_GUARDIAN;
      setShareConsent(!!pi?.shareConsentAt);

      // A local draft fresher than the server copy fills the answers (never the step)
      const draft = restoreDraft(user.id);
      const serverTime = p.updatedAt ? new Date(String(p.updatedAt)).getTime() : 0;
      if (draft && new Date(draft.savedAt).getTime() > serverTime) {
        for (const key of Object.keys(next)) {
          const v = draft.form?.[key];
          if (v !== undefined && sameShape(next[key], v)) next[key] = v;
        }
        for (const key of Object.keys(EMPTY_GUARDIAN) as (keyof GuardianForm)[]) {
          const v = draft.parentForm?.[key];
          if (typeof v === "string") nextGuardian[key] = v;
        }
      }
      const jobField = editField("job");
      setJobOther(!!jobField && isOtherJob(jobField, next, loadCtx));
      setForm(next);
      setGuardian(nextGuardian);
      setStep(firstIncompleteStep(steps, fromServer, loadCtx));
      loaded = true;
    } catch {
      // Never treat a failed load as an empty profile: saving it would overwrite what is stored
      setLoadFailed(true);
    } finally {
      setFetching(false);
      setAutoSaveEnabled(loaded);
    }
  }, [restoreDraft, router, steps, religionEnabled]);
  // The step count and «الديانة» follow the switches: load once they are known
  useEffect(() => {
    if (!dataLoading && countsKnown) loadProfile();
  }, [dataLoading, countsKnown, loadProfile]);

  // The local draft follows every change (debounced in the hook)
  useEffect(() => {
    if (autoSaveEnabled) saveToLocalStorage(form, guardian, Math.max(highestStored.current, storedStep(steps, step)), ownerId);
  }, [form, guardian, step, steps, autoSaveEnabled, saveToLocalStorage, ownerId]);

  // Each step and the done screen start at the top
  const topRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    topRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    // Screen readers hear the new step's name
    headingRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  function clearErrors(keys: string[]) {
    setErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function update(field: EditField, patch: Values) {
    const extra: Values = field.key === "maritalStatus" && patch.maritalStatus === SINGLE ? { childrenCount: "0" } : {};
    setForm((prev) => ({ ...prev, ...patch, ...extra }));
    clearErrors([field.key, ...Object.keys(extra)]);
  }

  function updateGuardian(key: keyof GuardianForm, value: string) {
    setGuardian((prev) => ({ ...prev, [key]: value }));
    clearErrors([key]);
  }

  /** The step's fields shown now: the table's `showIf`, and the children count once a marital status is chosen */
  function shownFields(s: SetupStep): EditField[] {
    return s.fieldKeys
      .map((key) => editField(key))
      .filter((f): f is EditField => !!f && (!f.showIf || f.showIf(showCtx)))
      .filter((f) => f.key !== "childrenCount" || !!form.maritalStatus);
  }

  /** The partner preferences as stored values (for the «شروط أساسية») */
  const prefs = useMemo(() => {
    const out: Values = {};
    for (const field of LOOKING_FIELDS) Object.assign(out, toPatch(field, Object.fromEntries(rowKeys(field).map((k) => [k, form[k]]))));
    return dealbreakerPrefsFor(form.religion as string | null | undefined, out) as DealbreakerPrefs;
  }, [form]);
  const activeTicked = activeDealbreakers(ticked, prefs, gender);

  function validate(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i >= steps.length) {
      if (!guardian.parentName) e.parentName = "اسم ولي الأمر مطلوب";
      if (!guardian.parentPhone) e.parentPhone = `رقم ${country.words.phone} ولي الأمر مطلوب`;
      if (!guardian.relationship) e.relationship = "صلة القرابة مطلوبة";
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
      return e;
    }
    const s = steps[i];
    const missing = new Set(missingOnStep(s, form, ctx).map(rowKeyOf));
    for (const field of shownFields(s)) {
      const label = field.label(ctx.gender, countryCode);
      const issue = checkDraft(field, form, label, field.key === "job" && jobOther, countryCode);
      if (issue) e[field.key] = issue;
      else if (missing.has(field.key)) e[field.key] = `${label} ${field.fem ? "مطلوبة" : "مطلوب"}`;
    }
    return e;
  }

  /** Every step's answers as stored values, empty ones left out (the server keeps what it has), through `sendableChanges` */
  function payload(lastStep = steps.length - 1): Values {
    const out: Values = {};
    for (const [i, s] of steps.entries()) {
      if (i > lastStep) break;
      for (const field of shownFields(s)) {
        const values = toPatch(field, Object.fromEntries(rowKeys(field).map((k) => [k, form[k]])));
        for (const [key, raw] of Object.entries(values)) {
          const v = typeof raw === "string" ? raw.trim() : raw;
          if (!isEmptyStored(v)) out[key] = v;
          // An answer removed here (a list emptied, a text erased, the old city's area) must be cleared on the
          // server too: "" and [] are accepted by the draft and the final save. Choices can't be unselected, and a
          // number can't be cleared (the schemas' numbers aren't nullable), so those stay as stored.
          else if (!isEmptyStored(serverValues.current[key]) && (Array.isArray(v) || CLEARABLE_TEXT.has(key) || isTextControl(field))) {
            out[key] = Array.isArray(v) ? [] : "";
          }
        }
      }
    }
    if (form.maritalStatus === SINGLE) out.childrenCount = 0;
    return sendableChanges(out, stored, religionEnabled);
  }

  /**
   * Checks steps `from`..`to`: on the first one with errors, opens it with its errors under the fields and brings
   * the first into view. True when all are fine.
   */
  function check(from: number, to: number): boolean {
    setError("");
    for (let i = from; i <= to; i++) {
      const e = validate(i);
      const first = Object.keys(e)[0];
      if (!first) continue;
      setErrors(e);
      setStep(i);
      // After the step renders: the message itself mid-screen, clear of the fixed button row on phones
      setTimeout(() => showError(first), 0);
      return false;
    }
    setErrors({});
    return true;
  }

  /** Brings a field's error into view; the «أخرى» job text box is focused (its error sits under it) */
  function showError(key: string) {
    const other = key === "job" ? document.getElementById("job-other") : null;
    const target = other ? document.getElementById("job-other-error") ?? other : document.getElementById(`${key}-error`) ?? document.querySelector(`[data-field="${key}"]`);
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    other?.focus({ preventScroll: true });
  }

  /** The stored `setupStep` for step `i`: never below what was stored or sent before */
  const stepToStore = (i: number) => Math.max(highestStored.current, storedStep(steps, i));

  function goNext() {
    if (!check(step, step)) return;
    const nextStep = step + 1;
    const toStore = stepToStore(nextStep);
    highestStored.current = toStore;
    // Only the steps checked so far: a later step's invalid answer (a restored draft) would fail the whole draft
    const draft = payload(step);
    saveToServer(toStore, draft);
    // Only what it now holds; a cleared answer stays known, so the final save clears it again if this draft failed
    for (const [key, v] of Object.entries(draft)) if (!isEmptyStored(v)) serverValues.current[key] = v;
    setStep(nextStep);
  }

  async function putJson(url: string, body: unknown, fallback: string): Promise<string | null> {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.error === "string" && data.error ? data.error : fallback;
  }

  async function finish() {
    // Every step up to this one (a restored draft may hold an answer an earlier step refuses)
    if (!check(0, step)) return;
    setSaving(true);
    try {
      // Legacy cycle: the guardian first, the profile only counts as complete once it has one (the server checks)
      if (guardianStep) {
        const failed = await putJson("/api/profile/parent-info", { ...guardian, shareConsent }, "حدث خطأ أثناء حفظ بيانات ولي الأمر");
        if (failed) return setError(failed);
      }
      // «شروط أساسية» go in the same save, as the legacy setup, so the first suggestions already respect them (the
      // server keeps the known keys and clears the Muslim-only ones for a Christian)
      const body = steps.some((s) => s.id === "musts")
        ? { ...payload(), dealbreakers: dealbreakerKeysToSave(ticked, prefs, form.religion as string | null | undefined, gender) }
        : payload();
      const failed = await putJson("/api/profile", body, "حدث خطأ أثناء حفظ الملف الشخصي");
      if (failed) return setError(failed);
      setSavedProfile({ ...stored, ...body });
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
  if (dataLoading || !countsKnown || fetching) return <PageLoading width="max-w-xl" />;
  if (done) {
    return (
      <div ref={topRef} className="scroll-mt-20">
        <SetupDone gender={gender} profile={savedProfile} />
      </div>
    );
  }

  const heading = onGuardian || !current
    ? { title: "بيانات ولي الأمر", sub: "هذه البيانات مطلوبة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين" }
    : {
        title: current.id === "looking" ? forViewer(gender, current.title, "من تبحثين عنه") : current.title,
        sub: stepSub(current.id, gender),
      };
  const last = step === totalSteps - 1;

  /** «شروط أساسية»: one toggle per filled preference that has one */
  function mustsStep() {
    const rows = LOOKING_FIELDS.filter((f) => f.dealbreaker && (!f.showIf || f.showIf(showCtx)))
      .map((f) => ({ field: f, key: f.dealbreaker as DealbreakerKey, summary: dealbreakerSummary(f.dealbreaker as DealbreakerKey, prefs, gender) }))
      .filter((r) => r.summary !== null);
    if (rows.length === 0) {
      return (
        <p className="rounded-xl bg-primary/5 p-4 text-body text-muted-ink">
          {forViewer(gender, "لم تختر تفضيلات بعد، يمكنك إضافتها لاحقاً من «تعديل ملفي».", "لم تختاري تفضيلات بعد، يمكنكِ إضافتها لاحقاً من «تعديل ملفي».")}
        </p>
      );
    }
    return (
      <>
        <p className="text-label font-normal text-muted-ink">{forViewer(gender, "لن نقترح عليك من لا يحققه.", "لن نقترح عليكِ من لا يحققه.")}</p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card">
          {rows.map(({ field, key, summary }) => {
            const id = `must-${key}`;
            return (
              <li key={key} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p id={`${id}-label`} className="text-body text-ink">{field.label(ctx.gender, countryCode)}</p>
                  <p className="text-caption text-muted-ink">{summary}</p>
                </div>
                <DealbreakerToggle
                  id={id}
                  checked={activeTicked.includes(key)}
                  onChange={(on) => setTicked((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)))}
                />
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-xl scroll-mt-20 pt-2">
      {/* Progress: one bar per step and «الخطوة X من N»; the step's name is the title below */}
      <div className="mb-6">
        <div className="mb-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} data-testid="setup-progress-segment" className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <p className="text-caption text-muted-ink">{`الخطوة ${step + 1} من ${totalSteps}`}</p>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="font-display text-display-sm text-ink outline-none">
        {heading.title}
      </h1>
      <p className="mt-1 mb-6 text-body text-muted-ink">{heading.sub}</p>

      <div className="space-y-6">
        {current && !onGuardian && current.id === "musts" && mustsStep()}

        {current &&
          !onGuardian &&
          current.id !== "musts" &&
          shownFields(current).map((field) => {
            const label = field.label(ctx.gender, countryCode);
            const hints = field.hints?.({ ...showCtx, dealbreakers: activeTicked }) ?? [];
            // «أخرى» chosen: the job's error is about the text box, so it sits under it
            const otherJobError = field.key === "job" && jobOther && !!errors.job;
            return (
              <Field key={field.key} id={field.key} label={label} optional={!setupRequired(field, showCtx)} error={otherJobError ? undefined : errors[field.key]}>
                <FieldControl
                  id={field.key}
                  field={field}
                  ctx={ctx}
                  value={Object.fromEntries(rowKeys(field).map((k) => [k, form[k]]))}
                  onChange={(patch) => update(field, patch)}
                  invalid={!!errors[field.key]}
                  jobOther={jobOther}
                  onJobOther={setJobOther}
                  otherError={otherJobError ? errors.job : undefined}
                />
                {hints.map((line) => (
                  <p key={line} className="px-1 text-caption text-muted-ink">
                    {line}
                  </p>
                ))}
              </Field>
            );
          })}

        {onGuardian && (
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
            <Field id="address" label="العنوان (اختياري)" error={errors.address}>
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

      {/* Fixed above the tab bar on phones, so «التالي» never scrolls away; in the page's flow from md (no tab bar) */}
      <FixedBottomBar
        staticFromMd
        spacerClassName="mt-8"
        className="flex items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur md:mt-8 md:border-0 md:bg-transparent md:backdrop-blur-none"
      >
        {step > 0 && (
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
      </FixedBottomBar>
    </div>
  );
}
