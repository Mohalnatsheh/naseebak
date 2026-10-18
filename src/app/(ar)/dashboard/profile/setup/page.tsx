"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, Save, AlertCircle } from "lucide-react";
import { useAutoSave } from "@/hooks/use-auto-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { jordanAreas, jordanCities } from "@/lib/data/jordan-areas";
import { trackEvent } from "@/lib/analytics";
import { useDashboardData } from "@/contexts/dashboard-context";
import { Field, ChoiceGroup, DealbreakerToggle } from "@/components/profile/form-fields";
import { OPTION_VALUES, ownOptions, partnerOptions, type Opt } from "@/lib/profile-options";
import { activeDealbreakers } from "@/lib/matching/dealbreaker-summary";
import type { DealbreakerKey } from "@/lib/matching/score";
import { arabicCount } from "@/lib/utils";
import { dateOfBirthError, maxDateOfBirth, parentInfoSchema } from "@/lib/validations/profile";
import { normalizePhone } from "@/lib/validations/auth";

const asOpts = (values: readonly string[]): Opt[] => values.map((v) => ({ value: v, label: v }));
const educationLevels = asOpts(["ثانوية عامة", "دبلوم", "بكالوريوس", "ماجستير", "دكتوراه"]);
const housingTypes = asOpts(["ملك", "إيجار", "مع العائلة"]);
const expenseRanges = asOpts(["أقل من 300 د.أ", "300-500 د.أ", "500-800 د.أ", "أكثر من 800 د.أ"]);
const skinColors = asOpts(["أبيض", "حنطي", "أسمر", "غامق"]);
const incomeRanges = asOpts(["أقل من 300 د.أ", "300-500 د.أ", "500-1000 د.أ", "1000-2000 د.أ", "أكثر من 2000 د.أ"]);
const relocateOptions: Opt[] = [
  { value: "yes", label: "نعم" },
  { value: "no", label: "لا" },
  { value: "maybe", label: "ربما" },
];
const jobValues: readonly string[] = OPTION_VALUES.job;
const preferenceOptions = asOpts(["نعم", "لا", "لا يهم"]);
const guardianRelationships: Opt[] = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "ولي الأمر" },
];
const inputError = (on: boolean | undefined) => (on ? "border-destructive" : "");
const textareaClass = (on: boolean | undefined, h = "min-h-[100px]") =>
  `w-full rounded-lg border bg-background px-3 py-2 text-sm ${h} resize-none focus:outline-none focus:ring-2 focus:ring-ring ${on ? "border-destructive" : "border-input"}`;
const selectClass = (on: boolean | undefined) =>
  `w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${on ? "border-destructive" : "border-input"}`;

export default function ProfileSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Start each step at the top of the page
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [error, setError] = useState("");
  const [gender, setGender] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    dateOfBirth: "",
    city: "",
    area: "",
    nationality: "أردني",
    education: "",
    fieldOfStudy: "",
    job: "",
    jobCustom: "",
    height: "",
    weight: "",
    skinColor: "",
    incomeRange: "",
    childrenCount: "",
    willingToRelocate: "",
    maritalStatus: "",
    religiosity: "",
    hijab: false,
    beard: false,
    smokingStatus: "",
    cookingAbility: "",
    lifestyle: "",
    drivingLicense: false,
    aboutMe: "",
    partnerExpectations: "",
    hobbies: "",
    interests: "",
    familyValues: "",
    tribe: "",
    familyOriginArea: "",
    numberOfSiblings: "",
    housingType: "",
    monthlyExpenses: "",
    healthConditions: "",
    prefAgeMin: "",
    prefAgeMax: "",
    prefCity: [] as string[],
    prefEducation: [] as string[],
    prefMaritalStatus: [] as string[],
    prefHijab: "",
    prefBeard: "",
    prefReligiosity: [] as string[],
    prefSmokingStatus: [] as string[],
    prefChildrenAcceptance: "",
    // "شرط أساسي" marks (saved to /api/profile/dealbreakers, not with the profile)
    dealbreakers: [] as string[],
  });

  const [parentForm, setParentForm] = useState({
    parentName: "",
    parentPhone: "",
    relationship: "",
    address: "",
  });

  // Consent to share the guardian contact after an accepted family introduction (new cycle)
  const [shareConsent, setShareConsent] = useState(false);
  const { counts, refreshProfile, profile: me } = useDashboardData();
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const { savedIndicatorVisible, saveToLocalStorage, restoreDraft, clearDraft, saveToServer } = useAutoSave(autoSaveEnabled);

  // Fetch existing profile data on load, then check localStorage draft
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        let serverUpdatedAt: string | null = null;
        let serverStep = 1;
        let draftOwner = "";

        if (res.ok) {
          const data = await res.json();
          const user = data.user;
          if (user?.id) {
            draftOwner = user.id;
            setOwnerId(user.id);
          }

          // If profile is already complete, redirect to view page
          if (user?.profile?.isComplete) {
            router.push("/dashboard/profile");
            return;
          }

          if (user?.gender) {
            setGender(user.gender);
            // Default nationality in the user's own gender ("أردنية" for women)
            if (user.gender === "FEMALE") setForm((prev) => (prev.nationality === "أردني" ? { ...prev, nationality: "أردنية" } : prev));
          }
          if (user?.profile) {
            const p = user.profile;
            serverUpdatedAt = p.updatedAt || null;
            serverStep = p.setupStep || 1;
            setForm((prev) => ({
              ...prev,
              dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split("T")[0] : "",
              city: p.city || "",
              area: p.area || "",
              nationality: p.nationality || (user.gender === "FEMALE" ? "أردنية" : "أردني"),
              education: p.education || "",
              fieldOfStudy: p.fieldOfStudy || "",
              job: p.job && jobValues.includes(p.job) ? p.job : p.job ? "أخرى" : "",
              jobCustom: p.job && !jobValues.includes(p.job) ? p.job : "",
              height: p.height ? String(p.height) : "",
              weight: p.weight ? String(p.weight) : "",
              skinColor: p.skinColor || "",
              incomeRange: p.incomeRange || "",
              childrenCount: p.childrenCount != null ? String(p.childrenCount) : "",
              willingToRelocate: p.willingToRelocate || "",
              maritalStatus: p.maritalStatus || "",
              religiosity: p.religiosity || "",
              hijab: p.hijab || false,
              beard: p.beard || false,
              smokingStatus: p.smokingStatus || "",
              cookingAbility: p.cookingAbility || "",
              lifestyle: p.lifestyle || "",
              drivingLicense: p.drivingLicense || false,
              aboutMe: p.aboutMe || "",
              partnerExpectations: p.partnerExpectations || "",
              hobbies: p.hobbies || "",
              interests: p.interests || "",
              familyValues: p.familyValues || "",
              tribe: p.tribe || "",
              familyOriginArea: p.familyOriginArea || "",
              numberOfSiblings: p.numberOfSiblings != null ? String(p.numberOfSiblings) : "",
              housingType: p.housingType || "",
              monthlyExpenses: p.monthlyExpenses || "",
              healthConditions: p.healthConditions || "",
              prefAgeMin: p.prefAgeMin != null ? String(p.prefAgeMin) : "",
              prefAgeMax: p.prefAgeMax != null ? String(p.prefAgeMax) : "",
              prefCity: Array.isArray(p.prefCity) ? p.prefCity : [],
              prefEducation: Array.isArray(p.prefEducation) ? p.prefEducation : [],
              prefMaritalStatus: Array.isArray(p.prefMaritalStatus) ? p.prefMaritalStatus : [],
              prefHijab: p.prefHijab || "",
              prefBeard: p.prefBeard || "",
              prefReligiosity: Array.isArray(p.prefReligiosity) ? p.prefReligiosity : [],
              prefSmokingStatus: Array.isArray(p.prefSmokingStatus) ? p.prefSmokingStatus : [],
              prefChildrenAcceptance: p.prefChildrenAcceptance || "",
              dealbreakers: Array.isArray(p.dealbreakers) ? p.dealbreakers : [],
            }));
            setStep(serverStep);
          }
          if (user?.parentInfo) {
            const pi = user.parentInfo;
            setParentForm((prev) => ({
              ...prev,
              parentName: pi.parentName || "",
              parentPhone: pi.parentPhone || "",
              relationship: pi.relationship || "",
              address: pi.address || "",
            }));
            setShareConsent(!!pi.shareConsentAt);
          }
        }

        // Check localStorage draft — use it if it's fresher than server data
        const draft = restoreDraft(draftOwner);
        if (draft) {
          const draftTime = new Date(draft.savedAt).getTime();
          const serverTime = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;

          if (draftTime > serverTime) {
            if (draft.form) {
              setForm((prev) => ({ ...prev, ...(draft.form as typeof prev) }));
            }
            if (draft.parentForm) {
              setParentForm((prev) => ({ ...prev, ...(draft.parentForm as typeof prev) }));
            }
            if (draft.step >= 1 && draft.step <= 5) {
              setStep(draft.step);
            }
          }
        }
      } catch {
        // Silently fail - user will fill in fresh data
      } finally {
        setFetchingProfile(false);
        setAutoSaveEnabled(true);
      }
    }
    fetchProfile();
  }, []);

  // Auto-save to localStorage on form/step changes (debounced)
  useEffect(() => {
    if (autoSaveEnabled) {
      saveToLocalStorage(form, parentForm, step, ownerId);
    }
  }, [form, parentForm, step, autoSaveEnabled, saveToLocalStorage, ownerId]);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  }

  function toggleDealbreaker(key: DealbreakerKey, on: boolean) {
    setForm((prev) => ({
      ...prev,
      dealbreakers: on ? [...new Set([...prev.dealbreakers, key])] : prev.dealbreakers.filter((k) => k !== key),
    }));
  }

  function toggleArray(field: "prefCity" | "prefEducation" | "prefMaritalStatus" | "prefReligiosity" | "prefSmokingStatus", value: string) {
    setForm((prev) => {
      const arr = prev[field];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter((v) => v !== value) };
      } else {
        return { ...prev, [field]: [...arr, value] };
      }
    });
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  }

  function updateParent(field: string, value: string) {
    setParentForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  }

  // When city changes, reset area if it doesn't belong to the new city
  function handleCityChange(city: string) {
    update("city", city);
    const areas = jordanAreas[city] || [];
    if (!areas.includes(form.area)) {
      update("area", "");
    }
  }

  // Short start: only the basics are required, everything else can be filled in later
  function validateStep(s: number): Record<string, string> {
    const errors: Record<string, string> = {};
    switch (s) {
      case 1: {
        if (!form.dateOfBirth) errors.dateOfBirth = "تاريخ الميلاد مطلوب";
        else { const dobErr = dateOfBirthError(form.dateOfBirth); if (dobErr) errors.dateOfBirth = dobErr; }
        if (!form.nationality) errors.nationality = "الجنسية مطلوبة";
        if (!form.city) errors.city = "المدينة مطلوبة";
        if (form.height) { const h = parseInt(form.height); if (h < 100 || h > 250) errors.height = "الطول يجب أن يكون بين 100 و 250 سم"; }
        if (form.weight) { const w = parseInt(form.weight); if (w < 30 || w > 300) errors.weight = "الوزن يجب أن يكون بين 30 و 300 كغ"; }
        if (!form.education) errors.education = "المستوى التعليمي مطلوب";
        if (form.job === "أخرى" && !form.jobCustom) errors.jobCustom = "يرجى تحديد الوظيفة";
        break;
      }
      case 2: {
        if (!form.maritalStatus) errors.maritalStatus = "الحالة الاجتماعية مطلوبة";
        if (form.maritalStatus && form.maritalStatus !== "أعزب/عزباء" && form.childrenCount === "") errors.childrenCount = "عدد الأبناء مطلوب";
        else if (form.maritalStatus !== "أعزب/عزباء" && form.childrenCount !== "") { const c = parseInt(form.childrenCount); if (c < 0 || c > 20) errors.childrenCount = "عدد الأبناء يجب أن يكون بين 0 و 20"; }
        if (!form.religiosity) errors.religiosity = "مستوى التدين مطلوب";
        break;
      }
      case 3: {
        if (!form.prefAgeMin) errors.prefAgeMin = "العمر الأدنى مطلوب";
        else { const min = parseInt(form.prefAgeMin); if (min < 18 || min > 70) errors.prefAgeMin = "العمر الأدنى يجب أن يكون بين 18 و 70"; }
        if (!form.prefAgeMax) errors.prefAgeMax = "العمر الأقصى مطلوب";
        else { const max = parseInt(form.prefAgeMax); if (max < 18 || max > 70) errors.prefAgeMax = "العمر الأقصى يجب أن يكون بين 18 و 70"; }
        if (form.prefAgeMin && form.prefAgeMax && parseInt(form.prefAgeMin) > parseInt(form.prefAgeMax)) {
          errors.prefAgeMin = "العمر الأدنى يجب أن يكون أقل من العمر الأقصى";
          errors.prefAgeMax = "العمر الأقصى يجب أن يكون أكبر من العمر الأدنى";
        }
        break;
      }
      case 4: {
        if (form.numberOfSiblings !== "") { const s = parseInt(form.numberOfSiblings); if (s < 0 || s > 20) errors.numberOfSiblings = "عدد الإخوة يجب أن يكون بين 0 و 20"; }
        break;
      }
      case 5: {
        if (!parentForm.parentName) errors.parentName = "اسم ولي الأمر مطلوب";
        if (!parentForm.parentPhone) errors.parentPhone = "رقم هاتف ولي الأمر مطلوب";
        if (!parentForm.relationship) errors.relationship = "صلة القرابة مطلوبة";
        if (!parentForm.address) errors.address = "العنوان مطلوب";
        // Same rules as the API (the other family sees this contact)
        const guardian = parentInfoSchema.safeParse({ ...parentForm, notes: undefined });
        if (!guardian.success) {
          for (const issue of guardian.error.issues) {
            const key = String(issue.path[0]);
            if (!errors[key]) errors[key] = issue.message;
          }
        }
        // The API refuses the user's own number too: say so here, next to the field
        if (!errors.parentPhone && me?.phone && normalizePhone(parentForm.parentPhone) === me.phone) {
          errors.parentPhone = "رقم وليّ الأمر يجب أن يختلف عن رقم هاتفك";
        }
        break;
      }
    }
    return errors;
  }

  function scrollToFirstError(errors: Record<string, string>) {
    const firstField = Object.keys(errors)[0];
    if (firstField) {
      const el = document.querySelector(`[data-field="${firstField}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function buildServerPayload() {
    const payload: Record<string, unknown> = {};
    if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
    if (form.city) payload.city = form.city;
    if (form.area) payload.area = form.area;
    if (form.nationality) payload.nationality = form.nationality;
    if (form.education) payload.education = form.education;
    if (form.fieldOfStudy) payload.fieldOfStudy = form.fieldOfStudy;
    if (form.job && (form.job !== "أخرى" || form.jobCustom)) payload.job = form.job === "أخرى" ? form.jobCustom : form.job;
    if (form.incomeRange) payload.incomeRange = form.incomeRange;
    if (form.height) payload.height = parseInt(form.height);
    if (form.weight) payload.weight = parseInt(form.weight);
    if (form.skinColor) payload.skinColor = form.skinColor;
    if (form.maritalStatus) {
      payload.maritalStatus = form.maritalStatus;
      payload.childrenCount = form.maritalStatus === "أعزب/عزباء" ? 0 : (form.childrenCount ? parseInt(form.childrenCount) : 0);
    }
    if (form.willingToRelocate) payload.willingToRelocate = form.willingToRelocate;
    if (form.religiosity) payload.religiosity = form.religiosity;
    payload.hijab = form.hijab;
    payload.beard = form.beard;
    if (form.smokingStatus) payload.smokingStatus = form.smokingStatus;
    if (form.cookingAbility) payload.cookingAbility = form.cookingAbility;
    if (form.lifestyle) payload.lifestyle = form.lifestyle;
    payload.drivingLicense = form.drivingLicense;
    if (form.aboutMe) payload.aboutMe = form.aboutMe;
    if (form.partnerExpectations) payload.partnerExpectations = form.partnerExpectations;
    if (form.hobbies) payload.hobbies = form.hobbies;
    if (form.interests) payload.interests = form.interests;
    if (form.familyValues) payload.familyValues = form.familyValues;
    if (form.tribe) payload.tribe = form.tribe;
    if (form.familyOriginArea) payload.familyOriginArea = form.familyOriginArea;
    if (form.numberOfSiblings !== "") payload.numberOfSiblings = parseInt(form.numberOfSiblings);
    if (form.housingType) payload.housingType = form.housingType;
    if (form.monthlyExpenses) payload.monthlyExpenses = form.monthlyExpenses;
    if (form.healthConditions) payload.healthConditions = form.healthConditions;
    if (form.prefAgeMin) payload.prefAgeMin = parseInt(form.prefAgeMin);
    if (form.prefAgeMax) payload.prefAgeMax = parseInt(form.prefAgeMax);
    if (form.prefCity.length > 0) payload.prefCity = form.prefCity;
    if (form.prefEducation.length > 0) payload.prefEducation = form.prefEducation;
    if (form.prefMaritalStatus.length > 0) payload.prefMaritalStatus = form.prefMaritalStatus;
    if (form.prefHijab) payload.prefHijab = form.prefHijab;
    if (form.prefBeard) payload.prefBeard = form.prefBeard;
    if (form.prefReligiosity.length > 0) payload.prefReligiosity = form.prefReligiosity;
    if (form.prefSmokingStatus.length > 0) payload.prefSmokingStatus = form.prefSmokingStatus;
    if (form.prefChildrenAcceptance) payload.prefChildrenAcceptance = form.prefChildrenAcceptance;
    return payload;
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      // Legacy: guardian first, the profile only counts as complete once it has one (the server checks).
      // New cycle: no guardian step; it is asked for when the person chooses a family introduction.
      const parentRes = guardianStep
        ? await fetch("/api/profile/parent-info", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...parentForm, shareConsent }),
          })
        : null;

      if (parentRes && !parentRes.ok) {
        const data = await parentRes.json().catch(() => ({}));
        const message = data.error || "حدث خطأ أثناء حفظ بيانات ولي الأمر";
        // The save button is at the bottom of a long step: mark the guardian field the message is
        // about (or show it by the button) instead of only in the banner at the top of the page
        const field = /رقم/.test(message) ? "parentPhone" : /اسم/.test(message) ? "parentName" : /العنوان/.test(message) ? "address" : null;
        if (field) {
          setFieldErrors({ [field]: message });
          scrollToFirstError({ [field]: message });
        } else {
          setError(message);
        }
        return;
      }

      // Save profile data (empty optional fields are left out)
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // "شرط أساسي" marks go in the same save (only for preferences that are filled in), so the
        // suggestions that start right after already respect them
        body: JSON.stringify({
          ...buildServerPayload(),
          ...(counts.flags.mutualSuggestions && { dealbreakers: activeDealbreakers(form.dealbreakers, dealbreakerPrefs, gender) }),
        }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error || "حدث خطأ أثناء حفظ الملف الشخصي");
        return;
      }
      trackEvent("profile_completed");

      clearDraft();
      // The dashboard's shared profile still holds the pre-setup copy (the welcome guide reads it)
      await refreshProfile();
      // New cycle: a finished setup is all suggestions need, so go straight to them
      // (legacy still needs 50% completeness: the profile page shows what's missing)
      router.push(counts.flags.introRequests ? "/dashboard/suggestions" : "/dashboard/profile");
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  // New cycle: the guardian is asked for only when it is needed (choosing a family introduction)
  const guardianStep = !counts.flags.introRequests;
  const totalSteps = guardianStep ? 5 : 4;
  const dealbreakerPrefs = {
    prefAgeMin: form.prefAgeMin, prefAgeMax: form.prefAgeMax, prefCity: form.prefCity,
    prefEducation: form.prefEducation, prefMaritalStatus: form.prefMaritalStatus,
    prefReligiosity: form.prefReligiosity, prefSmokingStatus: form.prefSmokingStatus,
    prefHijab: form.prefHijab, prefBeard: form.prefBeard, prefChildrenAcceptance: form.prefChildrenAcceptance,
  };
  const showDealbreakers = counts.flags.mutualSuggestions;
  /** "شرط أساسي" chip for one preference; disabled until that preference is filled in. */
  const dealbreaker = (key: DealbreakerKey, fieldId: string) =>
    showDealbreakers ? (
      <DealbreakerToggle
        id={fieldId}
        checked={form.dealbreakers.includes(key)}
        disabled={activeDealbreakers([key], dealbreakerPrefs, gender).length === 0}
        onChange={(v) => toggleDealbreaker(key, v)}
      />
    ) : null;
  const availableAreas = form.city ? (jordanAreas[form.city] || []) : [];

  // Someone who stopped at the old guardian step (5) resumes on the last step
  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps);
  }, [step, totalSteps]);

  if (fetchingProfile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">إعداد الملف الشخصي</h1>
        <p className="text-muted-foreground">أكمل بياناتك للحصول على أفضل اقتراحات التوافق</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex-1 flex items-center gap-2">
            <div className={`h-2 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`} />
          </div>
        ))}
        <span className="text-sm text-muted-foreground">{step}/{totalSteps}</span>
      </div>

      {/* Auto-save indicator */}
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity duration-300 ${savedIndicatorVisible ? "opacity-100" : "opacity-0"}`}>
        <Save className="h-3 w-3" />
        <span>تم الحفظ التلقائي</span>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {Object.keys(fieldErrors).length > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>يرجى تصحيح الحقول المطلوبة أدناه ({arabicCount(Object.keys(fieldErrors).length, { one: "حقل واحد", two: "حقلان", few: "حقول", many: "حقلاً" })})</span>
        </div>
      )}

      {/* Step 1: Personal Info */}
      {step === 1 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>المعلومات الشخصية</CardTitle>
            <CardDescription>البيانات الأساسية عنك. الحقول المكتوب بجانبها «اختياري» يمكنك إكمالها لاحقاً.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="dateOfBirth" label="تاريخ الميلاد" error={fieldErrors.dateOfBirth}>
                <Input id="dateOfBirth" type="date" max={maxDateOfBirth()} value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} dir="ltr" aria-invalid={!!fieldErrors.dateOfBirth} className={inputError(!!fieldErrors.dateOfBirth)} />
              </Field>
              <Field id="nationality" label="الجنسية" error={fieldErrors.nationality}>
                <Input id="nationality" value={form.nationality} onChange={(e) => update("nationality", e.target.value)} aria-invalid={!!fieldErrors.nationality} className={inputError(!!fieldErrors.nationality)} />
              </Field>
            </div>

            <Field id="city" label="المدينة" error={fieldErrors.city}>
              <ChoiceGroup id="city" options={jordanCities.map((c) => ({ value: c, label: c }))} isSelected={(v) => form.city === v} onSelect={handleCityChange} error={!!fieldErrors.city} />
            </Field>

            {form.city && availableAreas.length > 0 && (
              <Field id="area" label="المنطقة" optional error={fieldErrors.area}>
                <select id="area" value={form.area} onChange={(e) => update("area", e.target.value)} className={selectClass(!!fieldErrors.area)}>
                  <option value="">اختر المنطقة...</option>
                  {availableAreas.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field id="education" label="المستوى التعليمي" error={fieldErrors.education}>
              <ChoiceGroup id="education" options={educationLevels} isSelected={(v) => form.education === v} onSelect={(v) => update("education", v)} error={!!fieldErrors.education} />
            </Field>

            <Field id="fieldOfStudy" label="التخصص" optional error={fieldErrors.fieldOfStudy}>
              <Input id="fieldOfStudy" value={form.fieldOfStudy} onChange={(e) => update("fieldOfStudy", e.target.value)} placeholder="مثال: هندسة حاسوب، محاسبة، طب..." className={inputError(!!fieldErrors.fieldOfStudy)} />
            </Field>

            <Field id="job" label="الوظيفة" optional error={fieldErrors.job}>
              <select
                id="job"
                value={form.job}
                onChange={(e) => {
                  update("job", e.target.value);
                  if (e.target.value !== "أخرى") update("jobCustom", "");
                }}
                className={selectClass(!!fieldErrors.job)}
              >
                <option value="">اختر الوظيفة...</option>
                {ownOptions("job", gender).map((j) => (
                  <option key={j.value} value={j.value}>{j.label}</option>
                ))}
              </select>
              {form.job === "أخرى" && (
                <div data-field="jobCustom">
                  <Input id="jobCustom" aria-label="الوظيفة (أخرى)" value={form.jobCustom} onChange={(e) => update("jobCustom", e.target.value)} placeholder="حدد وظيفتك..." className={`mt-2 ${inputError(!!fieldErrors.jobCustom)}`} />
                  {fieldErrors.jobCustom && <p className="text-xs text-destructive mt-1">{fieldErrors.jobCustom}</p>}
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field id="height" label="الطول (سم)" optional error={fieldErrors.height}>
                <Input id="height" type="number" value={form.height} onChange={(e) => update("height", e.target.value)} placeholder="170" dir="ltr" aria-invalid={!!fieldErrors.height} className={inputError(!!fieldErrors.height)} />
              </Field>
              <Field id="weight" label="الوزن (كغ)" optional error={fieldErrors.weight}>
                <Input id="weight" type="number" value={form.weight} onChange={(e) => update("weight", e.target.value)} placeholder="70" dir="ltr" aria-invalid={!!fieldErrors.weight} className={inputError(!!fieldErrors.weight)} />
              </Field>
            </div>

            <Field id="skinColor" label="لون البشرة" optional>
              <ChoiceGroup id="skinColor" cols={4} options={skinColors} isSelected={(v) => form.skinColor === v} onSelect={(v) => update("skinColor", v)} />
            </Field>

            <Field id="incomeRange" label="مستوى الدخل" optional>
              <ChoiceGroup id="incomeRange" options={incomeRanges} isSelected={(v) => form.incomeRange === v} onSelect={(v) => update("incomeRange", v)} />
            </Field>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Lifestyle & Religion */}
      {step === 2 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>نمط الحياة والدين</CardTitle>
            <CardDescription>معلومات عن أسلوب حياتك</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="maritalStatus" label="الحالة الاجتماعية" error={fieldErrors.maritalStatus}>
              <ChoiceGroup
                id="maritalStatus"
                options={ownOptions("maritalStatus", gender)}
                isSelected={(v) => form.maritalStatus === v}
                onSelect={(v) => {
                  update("maritalStatus", v);
                  if (v === "أعزب/عزباء") update("childrenCount", "0");
                }}
                error={!!fieldErrors.maritalStatus}
              />
            </Field>

            {form.maritalStatus && form.maritalStatus !== "أعزب/عزباء" && (
              <Field id="childrenCount" label="عدد الأبناء" error={fieldErrors.childrenCount}>
                <Input id="childrenCount" type="number" value={form.childrenCount} onChange={(e) => update("childrenCount", e.target.value)} placeholder="0" min={0} max={20} dir="ltr" aria-invalid={!!fieldErrors.childrenCount} className={inputError(!!fieldErrors.childrenCount)} />
              </Field>
            )}

            <Field id="religiosity" label="مستوى التدين" error={fieldErrors.religiosity}>
              <ChoiceGroup id="religiosity" cols={2} options={ownOptions("religiosity", gender)} isSelected={(v) => form.religiosity === v} onSelect={(v) => update("religiosity", v)} error={!!fieldErrors.religiosity} />
            </Field>

            <Field id="smokingStatus" label="التدخين" optional>
              <ChoiceGroup id="smokingStatus" cols={2} options={ownOptions("smokingStatus", gender)} isSelected={(v) => form.smokingStatus === v} onSelect={(v) => update("smokingStatus", v)} />
            </Field>

            {/* Gender-specific: hijab for women, beard for men */}
            {gender === "FEMALE" && (
              <Field id="hijab" label="الحجاب">
                <button
                  id="hijab"
                  type="button"
                  role="switch"
                  aria-checked={form.hijab}
                  onClick={() => update("hijab", !form.hijab)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.hijab ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <span>محجبة</span>
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.hijab ? "bg-primary" : "bg-muted"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.hijab ? "translate-x-1" : "translate-x-5"}`} />
                  </div>
                </button>
              </Field>
            )}

            {gender === "MALE" && (
              <Field id="beard" label="اللحية">
                <button
                  id="beard"
                  type="button"
                  role="switch"
                  aria-checked={form.beard}
                  onClick={() => update("beard", !form.beard)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.beard ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <span>ملتحٍ</span>
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.beard ? "bg-primary" : "bg-muted"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.beard ? "translate-x-1" : "translate-x-5"}`} />
                  </div>
                </button>
              </Field>
            )}

            <Field id="cookingAbility" label="مهارة الطبخ" optional>
              <ChoiceGroup id="cookingAbility" cols={2} options={ownOptions("cookingAbility", gender)} isSelected={(v) => form.cookingAbility === v} onSelect={(v) => update("cookingAbility", v)} />
            </Field>

            <Field id="lifestyle" label="نمط الحياة" optional>
              <ChoiceGroup id="lifestyle" cols={4} options={ownOptions("lifestyle", gender)} isSelected={(v) => form.lifestyle === v} onSelect={(v) => update("lifestyle", v)} />
            </Field>

            <Field id="drivingLicense" label="رخصة قيادة" optional>
              <button
                id="drivingLicense"
                type="button"
                role="switch"
                aria-checked={form.drivingLicense}
                onClick={() => update("drivingLicense", !form.drivingLicense)}
                className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.drivingLicense ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
              >
                <span>لدي رخصة قيادة</span>
                <div className={`w-10 h-5 rounded-full transition-colors ${form.drivingLicense ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.drivingLicense ? "translate-x-1" : "translate-x-5"}`} />
                </div>
              </button>
            </Field>
          </CardContent>
        </Card>
      )}

      {/* Step 3: About Me & Preferences */}
      {step === 3 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>نبذة عني وتفضيلات الشريك</CardTitle>
            <CardDescription>
              {gender === "FEMALE" ? "أخبرينا عنك وعن الشريك الذي تبحثين عنه" : "أخبرنا عنك وعن الشريكة التي تبحث عنها"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="aboutMe" label="نبذة عني" optional>
              <textarea id="aboutMe" value={form.aboutMe} onChange={(e) => update("aboutMe", e.target.value)} className={textareaClass(false)} placeholder="تحدث عن نفسك واهتماماتك وطموحاتك..." maxLength={500} />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.aboutMe.length}/500</p>
            </Field>

            <Field id="partnerExpectations" label="مواصفات الشريك المطلوبة" optional>
              <textarea id="partnerExpectations" value={form.partnerExpectations} onChange={(e) => update("partnerExpectations", e.target.value)} className={textareaClass(false)} placeholder="صف المواصفات التي تبحث عنها في شريك حياتك..." maxLength={500} />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.partnerExpectations.length}/500</p>
            </Field>

            <Field id="hobbies" label="الهوايات" optional>
              <Input id="hobbies" value={form.hobbies} onChange={(e) => update("hobbies", e.target.value)} placeholder="مثال: القراءة، الرياضة، السفر..." />
            </Field>

            <Field id="interests" label="الاهتمامات" optional>
              <Input id="interests" value={form.interests} onChange={(e) => update("interests", e.target.value)} placeholder="مثال: التكنولوجيا، الطبخ، التصوير..." />
            </Field>

            <Field id="familyValues" label="القيم العائلية" optional>
              <textarea id="familyValues" value={form.familyValues} onChange={(e) => update("familyValues", e.target.value)} className={textareaClass(false, "min-h-[80px]")} placeholder="ما هي القيم التي تعتز بها في الحياة الأسرية..." maxLength={500} />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.familyValues.length}/500</p>
            </Field>

            {/* Preferences section */}
            <div className="pt-4 border-t space-y-1">
              <h3 className="text-base font-semibold">تفضيلات الشريك</h3>
              {showDealbreakers && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {gender === "FEMALE"
                    ? "ضعي علامة «شرط أساسي» على ما لا تقبلين التنازل عنه: لن نقترح عليكِ من لا يحققه. كثرة الشروط تقلّل الاقتراحات، وشروطكِ لا يراها أحد."
                    : "ضع علامة «شرط أساسي» على ما لا تقبل التنازل عنه: لن نقترح عليك من لا يحققه. كثرة الشروط تقلّل الاقتراحات، وشروطك لا يراها أحد."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 text-sm font-medium leading-relaxed">العمر المفضل</span>
                {dealbreaker("age", "prefAge")}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field id="prefAgeMin" label="العمر الأدنى" error={fieldErrors.prefAgeMin}>
                  <Input id="prefAgeMin" type="number" value={form.prefAgeMin} onChange={(e) => update("prefAgeMin", e.target.value)} placeholder="18" min={18} max={70} dir="ltr" aria-invalid={!!fieldErrors.prefAgeMin} className={inputError(!!fieldErrors.prefAgeMin)} />
                </Field>
                <Field id="prefAgeMax" label="العمر الأقصى" error={fieldErrors.prefAgeMax}>
                  <Input id="prefAgeMax" type="number" value={form.prefAgeMax} onChange={(e) => update("prefAgeMax", e.target.value)} placeholder="40" min={18} max={70} dir="ltr" aria-invalid={!!fieldErrors.prefAgeMax} className={inputError(!!fieldErrors.prefAgeMax)} />
                </Field>
              </div>
            </div>

            <Field id="prefCity" label="المدن المفضلة" hint="(يمكن اختيار أكثر من مدينة)" optional aside={dealbreaker("city", "prefCity")}>
              <ChoiceGroup id="prefCity" multiple options={jordanCities.map((c) => ({ value: c, label: c }))} isSelected={(v) => form.prefCity.includes(v)} onSelect={(v) => toggleArray("prefCity", v)} />
            </Field>

            <Field id="prefEducation" label="المستوى التعليمي المفضل" hint="(كل مستوى يشمل ما فوقه)" optional aside={dealbreaker("education", "prefEducation")}>
              <ChoiceGroup id="prefEducation" multiple options={educationLevels} isSelected={(v) => form.prefEducation.includes(v)} onSelect={(v) => toggleArray("prefEducation", v)} />
            </Field>

            <Field id="prefMaritalStatus" label="الحالة الاجتماعية المفضلة" hint="(يمكن اختيار أكثر من حالة)" optional aside={dealbreaker("maritalStatus", "prefMaritalStatus")}>
              <ChoiceGroup id="prefMaritalStatus" multiple options={partnerOptions("maritalStatus", gender)} isSelected={(v) => form.prefMaritalStatus.includes(v)} onSelect={(v) => toggleArray("prefMaritalStatus", v)} />
            </Field>

            {gender === "MALE" && (
              <Field id="prefHijab" label="هل تفضل محجبة؟" optional aside={dealbreaker("hijab", "prefHijab")}>
                <ChoiceGroup id="prefHijab" options={preferenceOptions} isSelected={(v) => form.prefHijab === v} onSelect={(v) => update("prefHijab", v)} />
              </Field>
            )}

            {gender === "FEMALE" && (
              <Field id="prefBeard" label="هل تفضلين ملتحياً؟" optional aside={dealbreaker("beard", "prefBeard")}>
                <ChoiceGroup id="prefBeard" options={preferenceOptions} isSelected={(v) => form.prefBeard === v} onSelect={(v) => update("prefBeard", v)} />
              </Field>
            )}

            <Field id="prefReligiosity" label="مستوى التدين المفضل" hint="(يمكن اختيار أكثر من مستوى)" optional aside={dealbreaker("religiosity", "prefReligiosity")}>
              <ChoiceGroup id="prefReligiosity" cols={2} multiple options={partnerOptions("religiosity", gender)} isSelected={(v) => form.prefReligiosity.includes(v)} onSelect={(v) => toggleArray("prefReligiosity", v)} />
            </Field>

            <Field id="prefSmokingStatus" label="حالة التدخين المفضلة" hint="(يمكن اختيار أكثر من حالة)" optional aside={dealbreaker("smokingStatus", "prefSmokingStatus")}>
              <ChoiceGroup id="prefSmokingStatus" cols={2} multiple options={partnerOptions("smokingStatus", gender)} isSelected={(v) => form.prefSmokingStatus.includes(v)} onSelect={(v) => toggleArray("prefSmokingStatus", v)} />
            </Field>

            <Field id="prefChildrenAcceptance" label="قبول وجود أبناء من زواج سابق" optional aside={dealbreaker("children", "prefChildrenAcceptance")}>
              <ChoiceGroup id="prefChildrenAcceptance" options={preferenceOptions} isSelected={(v) => form.prefChildrenAcceptance === v} onSelect={(v) => update("prefChildrenAcceptance", v)} />
            </Field>

            <Field id="willingToRelocate" label="الاستعداد للانتقال" optional>
              <ChoiceGroup id="willingToRelocate" options={relocateOptions} isSelected={(v) => form.willingToRelocate === v} onSelect={(v) => update("willingToRelocate", v)} />
            </Field>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Family Info (all optional) */}
      {step === 4 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>معلومات عائلية</CardTitle>
            <CardDescription>بيانات إضافية عن العائلة والسكن. كلها اختيارية ويمكنك إكمالها لاحقاً.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="tribe" label="العشيرة" optional>
              <Input id="tribe" value={form.tribe} onChange={(e) => update("tribe", e.target.value)} placeholder="اسم العشيرة" />
            </Field>

            <Field id="familyOriginArea" label="منطقة أصل العائلة" optional>
              <Input id="familyOriginArea" value={form.familyOriginArea} onChange={(e) => update("familyOriginArea", e.target.value)} placeholder="منطقة أصل العائلة" />
            </Field>

            <Field id="numberOfSiblings" label="عدد الإخوة والأخوات" optional error={fieldErrors.numberOfSiblings}>
              <Input id="numberOfSiblings" type="number" value={form.numberOfSiblings} onChange={(e) => update("numberOfSiblings", e.target.value)} placeholder="0" min={0} max={20} dir="ltr" aria-invalid={!!fieldErrors.numberOfSiblings} className={inputError(!!fieldErrors.numberOfSiblings)} />
            </Field>

            <Field id="housingType" label="نوع السكن" optional>
              <ChoiceGroup id="housingType" options={housingTypes} isSelected={(v) => form.housingType === v} onSelect={(v) => update("housingType", v)} />
            </Field>

            <Field id="monthlyExpenses" label="المصاريف الشهرية" optional>
              <ChoiceGroup id="monthlyExpenses" cols={2} options={expenseRanges} isSelected={(v) => form.monthlyExpenses === v} onSelect={(v) => update("monthlyExpenses", v)} />
            </Field>

            <Field id="healthConditions" label="حالات صحية" optional>
              <textarea id="healthConditions" value={form.healthConditions} onChange={(e) => update("healthConditions", e.target.value)} className={textareaClass(false, "min-h-[80px]")} placeholder="أي حالات صحية تود الإفصاح عنها..." maxLength={500} />
            </Field>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Guardian Info */}
      {step === 5 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>بيانات ولي الأمر</CardTitle>
            <CardDescription>
              {counts.flags.introRequests
                ? "بيانات وليّ الأمر سرية، ولا تظهر لأي مستخدم إلا لعائلة الطرف الآخر عند بدء تعارف عائلي على توافق متبادل وبموافقتك."
                : "هذه البيانات مطلوبة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="parentName" label="اسم ولي الأمر" error={fieldErrors.parentName}>
              <Input id="parentName" value={parentForm.parentName} onChange={(e) => updateParent("parentName", e.target.value)} placeholder="الاسم الكامل لولي الأمر" aria-invalid={!!fieldErrors.parentName} className={inputError(!!fieldErrors.parentName)} />
            </Field>

            <Field id="parentPhone" label="رقم هاتف ولي الأمر" error={fieldErrors.parentPhone}>
              <Input id="parentPhone" type="tel" value={parentForm.parentPhone} onChange={(e) => updateParent("parentPhone", e.target.value)} placeholder="07XXXXXXXX" dir="ltr" aria-invalid={!!fieldErrors.parentPhone} className={`text-left ${inputError(!!fieldErrors.parentPhone)}`} />
            </Field>

            <Field id="relationship" label="صلة القرابة" error={fieldErrors.relationship}>
              <ChoiceGroup id="relationship" cols={2} options={guardianRelationships} isSelected={(v) => parentForm.relationship === v} onSelect={(v) => updateParent("relationship", v)} error={!!fieldErrors.relationship} />
            </Field>

            <Field id="address" label="العنوان" error={fieldErrors.address}>
              <textarea id="address" value={parentForm.address} onChange={(e) => updateParent("address", e.target.value)} aria-invalid={!!fieldErrors.address} className={textareaClass(!!fieldErrors.address, "min-h-[80px]")} placeholder="العنوان التفصيلي (المدينة، الحي، الشارع...)" />
            </Field>

            {counts.flags.introRequests ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-3 text-sm hover:bg-primary/10">
                <input
                  type="checkbox"
                  checked={shareConsent}
                  onChange={(e) => setShareConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
                />
                <span className="leading-relaxed text-foreground/80">
                  أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط عند بدء تعارف عائلي على توافق متبادل. لا تظهر هذه البيانات لأي شخص قبل ذلك.
                </span>
              </label>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg text-sm text-muted-foreground">
                <span>هذه البيانات سرية وتستخدم فقط من قبل الإدارة لتنسيق الزيارات العائلية</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* A save error again by the button: the banner at the top is off screen on phones */}
      {error && step === totalSteps && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <Button variant="outline" onClick={() => { setFieldErrors({}); setStep(step - 1); }}>
            <ArrowRight className="h-4 w-4 me-2" />
            السابق
          </Button>
        ) : (
          <div />
        )}

        {step < totalSteps ? (
          <Button onClick={() => {
            const errors = validateStep(step);
            if (Object.keys(errors).length > 0) { setFieldErrors(errors); setError(""); scrollToFirstError(errors); return; }
            setFieldErrors({});
            setError("");
            const nextStep = step + 1;
            saveToServer(nextStep, buildServerPayload());
            setStep(nextStep);
          }} className="bg-gradient-to-l from-primary to-primary/80">
            التالي
            <ArrowLeft className="h-4 w-4 ms-2" />
          </Button>
        ) : (
          <Button onClick={() => {
            const errors = validateStep(step);
            if (Object.keys(errors).length > 0) { setFieldErrors(errors); setError(""); scrollToFirstError(errors); return; }
            setFieldErrors({});
            setError("");
            handleSubmit();
          }} disabled={loading} className="bg-gradient-to-l from-primary to-accent">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 me-2" />
                حفظ الملف الشخصي
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
