"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Send,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { jordanAreas, jordanCities } from "@/lib/data/jordan-areas";

const educationLevels = [
  "ثانوية عامة",
  "دبلوم",
  "بكالوريوس",
  "ماجستير",
  "دكتوراه",
];
const maritalStatuses = ["أعزب/عزباء", "مطلق/مطلقة", "أرمل/أرملة"];
const religiosityLevels = ["ملتزم جداً", "ملتزم", "متوسط", "غير ملتزم"];
const smokingStatuses = [
  "لا أدخن",
  "أدخن",
  "أدخن أحياناً",
  "تركت التدخين",
];
const cookingLevels = [
  "لا أطبخ",
  "أطبخ قليلاً",
  "أطبخ جيداً",
  "أطبخ ممتازاً",
];
const housingTypes = ["ملك", "إيجار", "مع العائلة"];
const expenseRanges = [
  "أقل من 300 د.أ",
  "300-500 د.أ",
  "500-800 د.أ",
  "أكثر من 800 د.أ",
];
const skinColors = ["أبيض", "حنطي", "أسمر", "غامق"];
const incomeRanges = [
  "أقل من 300 د.أ",
  "300-500 د.أ",
  "500-1000 د.أ",
  "1000-2000 د.أ",
  "أكثر من 2000 د.أ",
];
const jobOptions = [
  "مهندس", "طبيب", "صيدلي", "محامي", "معلم/أستاذ", "محاسب", "ممرض",
  "ضابط/عسكري", "موظف حكومي", "موظف قطاع خاص", "رجل أعمال",
  "تاجر", "مبرمج/مطور", "مصمم", "صحفي/إعلامي", "مقاول",
  "سائق", "حرفي/فني", "طالب/طالبة", "أعمال حرة", "ربة منزل",
  "متقاعد", "لا يعمل حالياً", "أخرى",
];
const preferenceOptions = ["نعم", "لا", "لا يهم"];
const guardianRelationships = [
  { value: "father", label: "الأب" },
  { value: "mother", label: "الأم" },
  { value: "brother", label: "الأخ" },
  { value: "guardian", label: "ولي الأمر" },
];
function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label>
      {children} <span className="text-destructive">*</span>
    </Label>
  );
}
const relocateOptions = [
  { value: "yes", label: "نعم" },
  { value: "no", label: "لا" },
  { value: "maybe", label: "ربما" },
];

interface ProfileForm {
  dateOfBirth: string;
  city: string;
  area: string;
  nationality: string;
  education: string;
  job: string;
  jobCustom: string;
  height: string;
  weight: string;
  skinColor: string;
  incomeRange: string;
  childrenCount: string;
  willingToRelocate: string;
  maritalStatus: string;
  religiosity: string;
  hijab: boolean;
  beard: boolean;
  smokingStatus: string;
  cookingAbility: string;
  drivingLicense: boolean;
  aboutMe: string;
  partnerExpectations: string;
  hobbies: string;
  familyValues: string;
  tribe: string;
  familyOriginArea: string;
  numberOfSiblings: string;
  housingType: string;
  monthlyExpenses: string;
  healthConditions: string;
  prefAgeMin: string;
  prefAgeMax: string;
  prefCity: string[];
  prefEducation: string[];
  prefMaritalStatus: string[];
  prefHijab: string;
  prefBeard: string;
  prefReligiosity: string[];
  prefSmokingStatus: string[];
  prefChildrenAcceptance: string;
  // Guardian fields
  parentName: string;
  parentPhone: string;
  relationship: string;
  parentAddress: string;
}

const emptyForm: ProfileForm = {
  dateOfBirth: "",
  city: "",
  area: "",
  nationality: "أردني",
  education: "",
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
  drivingLicense: false,
  aboutMe: "",
  partnerExpectations: "",
  hobbies: "",
  familyValues: "",
  tribe: "",
  familyOriginArea: "",
  numberOfSiblings: "",
  housingType: "",
  monthlyExpenses: "",
  healthConditions: "",
  prefAgeMin: "",
  prefAgeMax: "",
  prefCity: [],
  prefEducation: [],
  prefMaritalStatus: [],
  prefHijab: "",
  prefBeard: "",
  prefReligiosity: [],
  prefSmokingStatus: [],
  prefChildrenAcceptance: "",
  parentName: "",
  parentPhone: "",
  relationship: "",
  parentAddress: "",
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

export default function ProfileEditPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [gender, setGender] = useState<string>("");
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Original values from server — used to compute changes
  const [originalForm, setOriginalForm] = useState<ProfileForm>(emptyForm);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  // Consent to share the guardian contact after an accepted family introduction
  const [shareConsent, setShareConsent] = useState(false);
  const [originalShareConsent, setOriginalShareConsent] = useState(false);

  // Deep link: /dashboard/profile/edit?step=5 opens the guardian step
  useEffect(() => {
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    if (s >= 1 && s <= 5) setStep(s);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, requestsRes, parentRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/profile/update-request"),
          fetch("/api/profile/parent-info"),
        ]);
        const profileData = await profileRes.json();
        const requestsData = await requestsRes.json();
        const parentData = parentRes.ok ? await parentRes.json() : null;

        // Check for pending request
        const pending = requestsData.requests?.find(
          (r: { status: string }) => r.status === "PENDING"
        );
        if (pending) {
          setHasPendingRequest(true);
        }

        const user = profileData.user;
        if (user?.gender) setGender(user.gender);

        if (user?.profile) {
          const p = user.profile;
          const pi = parentData?.parentInfo;
          const loaded: ProfileForm = {
            dateOfBirth: p.dateOfBirth
              ? new Date(p.dateOfBirth).toISOString().split("T")[0]
              : "",
            city: p.city || "",
            area: p.area || "",
            nationality: p.nationality || "أردني",
            education: p.education || "",
            job: p.job && jobOptions.includes(p.job) ? p.job : p.job ? "أخرى" : "",
            jobCustom: p.job && !jobOptions.includes(p.job) ? p.job : "",
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
            drivingLicense: p.drivingLicense || false,
            aboutMe: p.aboutMe || "",
            partnerExpectations: p.partnerExpectations || "",
            hobbies: p.hobbies || "",
            familyValues: p.familyValues || "",
            tribe: p.tribe || "",
            familyOriginArea: p.familyOriginArea || "",
            numberOfSiblings:
              p.numberOfSiblings != null ? String(p.numberOfSiblings) : "",
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
            parentName: pi?.parentName || "",
            parentPhone: pi?.parentPhone || "",
            relationship: pi?.relationship || "",
            parentAddress: pi?.address || "",
          };
          setOriginalForm(loaded);
          setForm(loaded);
          setShareConsent(!!pi?.shareConsentAt);
          setOriginalShareConsent(!!pi?.shareConsentAt);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
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
  }

  function handleCityChange(city: string) {
    update("city", city);
    const areas = jordanAreas[city] || [];
    if (!areas.includes(form.area)) {
      update("area", "");
    }
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!form.dateOfBirth) return "يرجى إدخال تاريخ الميلاد";
      if (!form.nationality) return "يرجى إدخال الجنسية";
      if (!form.city) return "يرجى اختيار المدينة";
      if (!form.area) return "يرجى اختيار المنطقة";
      if (!form.height) return "يرجى إدخال الطول";
      if (!form.weight) return "يرجى إدخال الوزن";
      if (!form.skinColor) return "يرجى اختيار لون البشرة";
      if (!form.education) return "يرجى اختيار المستوى التعليمي";
      if (!form.job) return "يرجى اختيار الوظيفة";
      if (form.job === "أخرى" && !form.jobCustom) return "يرجى تحديد الوظيفة";
      if (!form.incomeRange) return "يرجى اختيار مستوى الدخل";
    }
    if (s === 2) {
      if (!form.maritalStatus) return "يرجى اختيار الحالة الاجتماعية";
      if (form.maritalStatus !== "أعزب/عزباء" && !form.childrenCount) return "يرجى إدخال عدد الأبناء";
      if (!form.religiosity) return "يرجى اختيار مستوى التدين";
      if (!form.smokingStatus) return "يرجى اختيار حالة التدخين";
      if (!form.cookingAbility) return "يرجى اختيار مهارة الطبخ";
    }
    if (s === 3) {
      if (!form.aboutMe || form.aboutMe.length < 10) return "يرجى كتابة نبذة عنك (10 أحرف على الأقل)";
      if (!form.partnerExpectations || form.partnerExpectations.length < 10) return "يرجى كتابة مواصفات الشريك المطلوبة (10 أحرف على الأقل)";
      if (!form.hobbies) return "يرجى إدخال الهوايات والاهتمامات";
      if (!form.prefAgeMin) return "يرجى إدخال العمر الأدنى المفضل";
      if (!form.prefAgeMax) return "يرجى إدخال العمر الأقصى المفضل";
      if (parseInt(form.prefAgeMin) > parseInt(form.prefAgeMax)) return "العمر الأدنى يجب أن يكون أقل من العمر الأقصى";
      if (!form.prefChildrenAcceptance) return "يرجى اختيار تفضيل قبول الأبناء";
    }
    if (s === 4) {
      if (!form.tribe) return "يرجى إدخال اسم العشيرة";
      if (!form.familyOriginArea) return "يرجى إدخال منطقة أصل العائلة";
      if (!form.numberOfSiblings && form.numberOfSiblings !== "0") return "يرجى إدخال عدد الإخوة والأخوات";
      if (!form.housingType) return "يرجى اختيار نوع السكن";
      if (!form.monthlyExpenses) return "يرجى اختيار المصاريف الشهرية";
    }
    if (s === 5) {
      if (!form.parentName) return "يرجى إدخال اسم ولي الأمر";
      if (!form.parentPhone) return "يرجى إدخال رقم هاتف ولي الأمر";
      if (!form.relationship) return "يرجى اختيار صلة القرابة";
      if (!form.parentAddress) return "يرجى إدخال العنوان";
    }
    return null;
  }

  function scrollToError() {
    setTimeout(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function handleNextStep() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      scrollToError();
      return;
    }
    setError("");
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getChangedFields(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const arrayFields = ["prefCity", "prefEducation", "prefMaritalStatus", "prefReligiosity", "prefSmokingStatus"] as const;
    const guardianFields = ["parentName", "parentPhone", "relationship", "parentAddress"];

    for (const key of Object.keys(form) as (keyof ProfileForm)[]) {
      if (key === "jobCustom") continue;
      if (guardianFields.includes(key)) continue;
      if (arrayFields.includes(key as typeof arrayFields[number])) {
        const formArr = form[key] as string[];
        const origArr = originalForm[key] as string[];
        if (!arraysEqual(formArr, origArr)) {
          changes[key] = formArr;
        }
      } else if (key === "job") {
        const resolvedJob = form.job === "أخرى" ? form.jobCustom : form.job;
        const resolvedOrigJob = originalForm.job === "أخرى" ? originalForm.jobCustom : originalForm.job;
        if (resolvedJob !== resolvedOrigJob) {
          changes.job = resolvedJob;
        }
      } else if (form[key] !== originalForm[key]) {
        const val = form[key];
        if ((key === "numberOfSiblings" || key === "childrenCount") && typeof val === "string" && val) {
          changes[key] = parseInt(val);
        } else if (
          (key === "prefAgeMin" || key === "prefAgeMax") &&
          typeof val === "string" &&
          val
        ) {
          changes[key] = parseInt(val);
        } else {
          changes[key] = val;
        }
      }
    }
    return changes;
  }

  function hasGuardianChanges(): boolean {
    return (
      form.parentName !== originalForm.parentName ||
      form.parentPhone !== originalForm.parentPhone ||
      form.relationship !== originalForm.relationship ||
      form.parentAddress !== originalForm.parentAddress ||
      shareConsent !== originalShareConsent
    );
  }

  async function handleSubmit() {
    // Validate all steps before submitting
    for (let s = 1; s <= totalSteps; s++) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        setError(err);
        scrollToError();
        return;
      }
    }

    const changes = getChangedFields();
    const guardianChanged = hasGuardianChanges();

    if (Object.keys(changes).length === 0 && !guardianChanged) {
      setError("لم تقم بإجراء أي تعديلات");
      scrollToError();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const promises: Promise<Response>[] = [];

      // Submit profile changes for admin review (if any)
      if (Object.keys(changes).length > 0) {
        promises.push(
          fetch("/api/profile/update-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ changes }),
          })
        );
      }

      // Save guardian info directly (admin-only data, no review needed)
      if (guardianChanged) {
        promises.push(
          fetch("/api/profile/parent-info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentName: form.parentName,
              parentPhone: form.parentPhone,
              relationship: form.relationship,
              address: form.parentAddress,
              shareConsent,
            }),
          })
        );
      }

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        setSuccess(true);
      } else {
        const failedRes = results.find((r) => !r.ok);
        if (failedRes) {
          const data = await failedRes.json();
          setError(data.error || "حدث خطأ أثناء إرسال طلب التعديل");
          scrollToError();
        }
      }
    } catch {
      setError("حدث خطأ غير متوقع");
      scrollToError();
    } finally {
      setSubmitting(false);
    }
  }

  const totalSteps = 5;
  const availableAreas = form.city ? jordanAreas[form.city] || [] : [];
  const changedCount = Object.keys(getChangedFields()).length + (hasGuardianChanges() ? 1 : 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          جاري تحميل بيانات الملف الشخصي...
        </p>
      </div>
    );
  }

  // If user already has a pending request
  if (hasPendingRequest) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/8 to-primary/3 shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/10 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-primary">
                لديك طلب تعديل قيد المراجعة
              </h3>
              <p className="text-sm text-primary/80 max-w-sm mx-auto leading-relaxed">
                يجب انتظار مراجعة الإدارة لطلب التعديل الحالي قبل إرسال طلب
                جديد. سيتم إعلامك بالنتيجة عبر الإشعارات.
              </p>
            </div>
            <Button
              asChild
              className="bg-gradient-to-l from-primary to-primary/80 rounded-xl font-semibold"
            >
              <Link href="/dashboard/profile">
                <ArrowLeft className="h-4 w-4 me-2" />
                العودة للملف الشخصي
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <Card className="relative overflow-hidden border-emerald-200/60 bg-gradient-to-l from-emerald-50/80 to-emerald-50/30 shadow-md">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-emerald-200/20 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-100 border border-emerald-200/60">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-emerald-900">
                تم إرسال طلب التعديل بنجاح
              </h3>
              <p className="text-sm text-emerald-700/80 max-w-sm mx-auto leading-relaxed">
                سيقوم فريق الإدارة بمراجعة التعديلات المطلوبة وسيتم إعلامك
                بالنتيجة عبر الإشعارات.
              </p>
            </div>
            <Button
              asChild
              className="bg-gradient-to-l from-primary to-primary/80 rounded-xl font-semibold"
            >
              <Link href="/dashboard/profile">
                <ArrowLeft className="h-4 w-4 me-2" />
                العودة للملف الشخصي
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">طلب تعديل الملف الشخصي</h1>
        <p className="text-muted-foreground text-sm">
          عدّل البيانات التي تريد تغييرها. سيتم إرسال التعديلات للمراجعة من قبل
          الإدارة.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 p-4">
        <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-primary leading-relaxed">
          التعديلات لن تُطبَّق مباشرة. سيقوم فريق الإدارة بمراجعتها والموافقة
          عليها أو رفضها.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} className="flex-1 flex items-center gap-2">
            <div
              className={`h-2 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`}
            />
          </div>
        ))}
        <span className="text-sm text-muted-foreground">
          {step}/{totalSteps}
        </span>
      </div>

      {error && (
        <div ref={errorRef} className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Personal Info */}
      {step === 1 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>المعلومات الشخصية</CardTitle>
            <CardDescription>البيانات الأساسية عنك</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>تاريخ الميلاد</RequiredLabel>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => update("dateOfBirth", e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel>الجنسية</RequiredLabel>
                <Input
                  value={form.nationality}
                  onChange={(e) => update("nationality", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>المدينة</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {jordanCities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleCityChange(c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.city === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {form.city && availableAreas.length > 0 && (
              <div className="space-y-2">
                <RequiredLabel>المنطقة</RequiredLabel>
                <select
                  value={form.area}
                  onChange={(e) => update("area", e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">اختر المنطقة...</option>
                  {availableAreas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>الطول (سم)</RequiredLabel>
                <Input
                  type="number"
                  value={form.height}
                  onChange={(e) => update("height", e.target.value)}
                  placeholder="170"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel>الوزن (كغ)</RequiredLabel>
                <Input
                  type="number"
                  value={form.weight}
                  onChange={(e) => update("weight", e.target.value)}
                  placeholder="70"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>لون البشرة</RequiredLabel>
              <div className="grid grid-cols-4 gap-2">
                {skinColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update("skinColor", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.skinColor === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>المستوى التعليمي</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {educationLevels.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => update("education", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.education === e ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>الوظيفة</RequiredLabel>
              <select
                value={form.job}
                onChange={(e) => {
                  update("job", e.target.value);
                  if (e.target.value !== "أخرى") update("jobCustom", "");
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">اختر الوظيفة...</option>
                {jobOptions.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              {form.job === "أخرى" && (
                <Input
                  value={form.jobCustom}
                  onChange={(e) => update("jobCustom", e.target.value)}
                  placeholder="حدد وظيفتك..."
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <RequiredLabel>مستوى الدخل</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {incomeRanges.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => update("incomeRange", r)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.incomeRange === r ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
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
            <div className="space-y-2">
              <RequiredLabel>الحالة الاجتماعية</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {maritalStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      update("maritalStatus", s);
                      if (s === "أعزب/عزباء") update("childrenCount", "0");
                    }}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.maritalStatus === s ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {form.maritalStatus !== "أعزب/عزباء" && (
              <div className="space-y-2">
                <RequiredLabel>عدد الأبناء</RequiredLabel>
                <Input
                  type="number"
                  value={form.childrenCount}
                  onChange={(e) => update("childrenCount", e.target.value)}
                  placeholder="0"
                  min={0}
                  max={20}
                  dir="ltr"
                />
              </div>
            )}

            <div className="space-y-2">
              <RequiredLabel>مستوى التدين</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {religiosityLevels.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => update("religiosity", r)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.religiosity === r ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>التدخين</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {smokingStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update("smokingStatus", s)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.smokingStatus === s ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {gender === "FEMALE" && (
              <div className="space-y-2">
                <Label>الحجاب</Label>
                <button
                  type="button"
                  onClick={() => update("hijab", !form.hijab)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.hijab ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <span>محجبة</span>
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${form.hijab ? "bg-primary" : "bg-muted"}`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.hijab ? "translate-x-1" : "translate-x-5"}`}
                    />
                  </div>
                </button>
              </div>
            )}

            {gender === "MALE" && (
              <div className="space-y-2">
                <Label>اللحية</Label>
                <button
                  type="button"
                  onClick={() => update("beard", !form.beard)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.beard ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <span>ملتحٍ</span>
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${form.beard ? "bg-primary" : "bg-muted"}`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.beard ? "translate-x-1" : "translate-x-5"}`}
                    />
                  </div>
                </button>
              </div>
            )}

            <div className="space-y-2">
              <RequiredLabel>مهارة الطبخ</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {cookingLevels.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update("cookingAbility", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.cookingAbility === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>رخصة قيادة</Label>
              <button
                type="button"
                onClick={() => update("drivingLicense", !form.drivingLicense)}
                className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.drivingLicense ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
              >
                <span>لدي رخصة قيادة</span>
                <div
                  className={`w-10 h-5 rounded-full transition-colors ${form.drivingLicense ? "bg-primary" : "bg-muted"}`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.drivingLicense ? "translate-x-1" : "translate-x-5"}`}
                  />
                </div>
              </button>
            </div>
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
              أخبرنا عنك وعن الشريك المثالي
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <RequiredLabel>نبذة عني</RequiredLabel>
              <textarea
                value={form.aboutMe}
                onChange={(e) => update("aboutMe", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="تحدث عن نفسك واهتماماتك وطموحاتك..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">
                {form.aboutMe.length}/500
              </p>
            </div>

            <div className="space-y-2">
              <RequiredLabel>مواصفات الشريك المطلوبة</RequiredLabel>
              <textarea
                value={form.partnerExpectations}
                onChange={(e) =>
                  update("partnerExpectations", e.target.value)
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="صف المواصفات التي تبحث عنها في شريك حياتك..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">
                {form.partnerExpectations.length}/500
              </p>
            </div>

            <div className="space-y-2">
              <RequiredLabel>الهوايات والاهتمامات</RequiredLabel>
              <Input
                value={form.hobbies}
                onChange={(e) => update("hobbies", e.target.value)}
                placeholder="مثال: القراءة، الرياضة، السفر..."
              />
            </div>

            <div className="space-y-2">
              <Label>القيم العائلية</Label>
              <textarea
                value={form.familyValues}
                onChange={(e) => update("familyValues", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="ما هي القيم التي تعتز بها في الحياة الأسرية..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">
                {form.familyValues.length}/500
              </p>
            </div>

            {/* Preferences section */}
            <div className="pt-4 border-t">
              <h3 className="text-base font-semibold mb-3">
                تفضيلات الشريك
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>العمر الأدنى</RequiredLabel>
                <Input
                  type="number"
                  value={form.prefAgeMin}
                  onChange={(e) => update("prefAgeMin", e.target.value)}
                  placeholder="18"
                  min={18}
                  max={70}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel>العمر الأقصى</RequiredLabel>
                <Input
                  type="number"
                  value={form.prefAgeMax}
                  onChange={(e) => update("prefAgeMax", e.target.value)}
                  placeholder="40"
                  min={18}
                  max={70}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>المدن المفضلة <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من مدينة)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {jordanCities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleArray("prefCity", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefCity.includes(c) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>المستوى التعليمي المفضل <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من مستوى)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {educationLevels.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggleArray("prefEducation", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefEducation.includes(e) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>الحالة الاجتماعية المفضلة <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من حالة)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {maritalStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleArray("prefMaritalStatus", s)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefMaritalStatus.includes(s) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {gender === "MALE" && (
              <div className="space-y-2">
                <Label>هل تفضل محجبة؟</Label>
                <div className="grid grid-cols-3 gap-2">
                  {preferenceOptions.map((o) => (
                    <button key={o} type="button" onClick={() => update("prefHijab", o)}
                      className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefHijab === o ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                    >{o}</button>
                  ))}
                </div>
              </div>
            )}

            {gender === "FEMALE" && (
              <div className="space-y-2">
                <Label>هل تفضلين ملتحي؟</Label>
                <div className="grid grid-cols-3 gap-2">
                  {preferenceOptions.map((o) => (
                    <button key={o} type="button" onClick={() => update("prefBeard", o)}
                      className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefBeard === o ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                    >{o}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>مستوى التدين المفضل <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من مستوى)</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {religiosityLevels.map((r) => (
                  <button key={r} type="button" onClick={() => toggleArray("prefReligiosity", r)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefReligiosity.includes(r) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{r}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>حالة التدخين المفضلة <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من حالة)</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {smokingStatuses.map((s) => (
                  <button key={s} type="button" onClick={() => toggleArray("prefSmokingStatus", s)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefSmokingStatus.includes(s) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>قبول وجود أبناء من زواج سابق</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {preferenceOptions.map((o) => (
                  <button key={o} type="button" onClick={() => update("prefChildrenAcceptance", o)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefChildrenAcceptance === o ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{o}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>الاستعداد للانتقال</Label>
              <div className="grid grid-cols-3 gap-2">
                {relocateOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => update("willingToRelocate", r.value)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.willingToRelocate === r.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Family Info */}
      {step === 4 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>معلومات عائلية</CardTitle>
            <CardDescription>
              بيانات إضافية عن العائلة والسكن
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <RequiredLabel>العشيرة</RequiredLabel>
              <Input
                value={form.tribe}
                onChange={(e) => update("tribe", e.target.value)}
                placeholder="اسم العشيرة"
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel>منطقة أصل العائلة</RequiredLabel>
              <Input
                value={form.familyOriginArea}
                onChange={(e) =>
                  update("familyOriginArea", e.target.value)
                }
                placeholder="منطقة أصل العائلة"
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel>عدد الإخوة والأخوات</RequiredLabel>
              <Input
                type="number"
                value={form.numberOfSiblings}
                onChange={(e) =>
                  update("numberOfSiblings", e.target.value)
                }
                placeholder="0"
                min={0}
                max={20}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel>نوع السكن</RequiredLabel>
              <div className="grid grid-cols-3 gap-2">
                {housingTypes.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => update("housingType", h)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.housingType === h ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>المصاريف الشهرية</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {expenseRanges.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => update("monthlyExpenses", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.monthlyExpenses === e ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>حالات صحية</Label>
              <textarea
                value={form.healthConditions}
                onChange={(e) =>
                  update("healthConditions", e.target.value)
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="أي حالات صحية تود الإفصاح عنها..."
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Guardian Info */}
      {step === 5 && (
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-l from-primary via-primary/50 to-accent" />
          <CardHeader>
            <CardTitle>معلومات ولي الأمر</CardTitle>
            <CardDescription>
              بيانات ولي الأمر لتنسيق الزيارات العائلية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 p-4">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-primary leading-relaxed">
                هذه البيانات سرية وتستخدم فقط من قبل الإدارة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين. يتم حفظها مباشرة دون الحاجة لمراجعة الإدارة.
              </p>
            </div>

            <div className="space-y-2">
              <RequiredLabel>اسم ولي الأمر</RequiredLabel>
              <Input
                value={form.parentName}
                onChange={(e) => update("parentName", e.target.value)}
                placeholder="الاسم الكامل لولي الأمر"
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel>رقم هاتف ولي الأمر</RequiredLabel>
              <Input
                type="tel"
                value={form.parentPhone}
                onChange={(e) => update("parentPhone", e.target.value)}
                placeholder="07XXXXXXXX"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel>صلة القرابة</RequiredLabel>
              <div className="grid grid-cols-2 gap-2">
                {guardianRelationships.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => update("relationship", r.value)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.relationship === r.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <RequiredLabel>العنوان</RequiredLabel>
              <textarea
                value={form.parentAddress}
                onChange={(e) => update("parentAddress", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="العنوان التفصيلي (المدينة، الحي، الشارع...)"
                maxLength={500}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm hover:bg-muted/40">
              <input
                type="checkbox"
                checked={shareConsent}
                onChange={(e) => setShareConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
              />
              <span className="leading-relaxed text-foreground/80">
                أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط بعد قبول طلب التعارف العائلي.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {/* Changes indicator */}
      {changedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-accent/10 border border-accent/30 p-3 text-sm text-accent-foreground">
          <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
          <span>
            تم تعديل <strong>{changedCount}</strong> حقل/حقول
          </span>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            <ArrowRight className="h-4 w-4 me-2" />
            السابق
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/dashboard/profile">
              <ArrowRight className="h-4 w-4 me-2" />
              إلغاء
            </Link>
          </Button>
        )}

        {step < totalSteps ? (
          <Button
            onClick={handleNextStep}
            className="bg-gradient-to-l from-primary to-primary/80"
          >
            التالي
            <ArrowLeft className="h-4 w-4 ms-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || changedCount === 0}
            className="bg-gradient-to-l from-primary to-accent"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 me-2" />
                إرسال طلب التعديل ({changedCount})
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
