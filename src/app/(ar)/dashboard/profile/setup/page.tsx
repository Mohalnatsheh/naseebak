"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { jordanAreas, jordanCities } from "@/lib/data/jordan-areas";

const educationLevels = ["ثانوية عامة", "دبلوم", "بكالوريوس", "ماجستير", "دكتوراه"];
const maritalStatuses = ["أعزب/عزباء", "مطلق/مطلقة", "أرمل/أرملة"];
const religiosityLevels = ["ملتزم جداً", "ملتزم", "متوسط", "غير ملتزم"];
const smokingStatuses = ["لا أدخن", "أدخن", "أدخن أحياناً", "تركت التدخين"];
const cookingLevels = ["لا أطبخ", "أطبخ قليلاً", "أطبخ جيداً", "أطبخ ممتازاً"];
const housingTypes = ["ملك", "إيجار", "مع العائلة"];
const expenseRanges = ["أقل من 300 د.أ", "300-500 د.أ", "500-800 د.أ", "أكثر من 800 د.أ"];
const skinColors = ["أبيض", "حنطي", "أسمر", "غامق"];
const incomeRanges = ["أقل من 300 د.أ", "300-500 د.أ", "500-1000 د.أ", "1000-2000 د.أ", "أكثر من 2000 د.أ"];
const lifestyleOptions = ["نشيط", "هادئ", "متوازن", "اجتماعي"];
const relocateOptions = [
  { value: "yes", label: "نعم" },
  { value: "no", label: "لا" },
  { value: "maybe", label: "ربما" },
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

export default function ProfileSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [error, setError] = useState("");
  const [gender, setGender] = useState<string>("");

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
  });

  const [parentForm, setParentForm] = useState({
    parentName: "",
    parentPhone: "",
    relationship: "",
    address: "",
  });

  // Fetch existing profile data on load
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          const user = data.user;

          // If profile is already complete, redirect to view page
          if (user?.profile?.isComplete) {
            router.push("/dashboard/profile");
            return;
          }

          if (user?.gender) {
            setGender(user.gender);
          }
          if (user?.profile) {
            const p = user.profile;
            setForm((prev) => ({
              ...prev,
              dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split("T")[0] : "",
              city: p.city || "",
              area: p.area || "",
              nationality: p.nationality || "أردني",
              education: p.education || "",
              fieldOfStudy: p.fieldOfStudy || "",
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
            }));
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
          }
        }
      } catch {
        // Silently fail - user will fill in fresh data
      } finally {
        setFetchingProfile(false);
      }
    }
    fetchProfile();
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

  function updateParent(field: string, value: string) {
    setParentForm((prev) => ({ ...prev, [field]: value }));
  }

  // When city changes, reset area if it doesn't belong to the new city
  function handleCityChange(city: string) {
    update("city", city);
    const areas = jordanAreas[city] || [];
    if (!areas.includes(form.area)) {
      update("area", "");
    }
  }

  function validateStep(s: number): string {
    switch (s) {
      case 1: {
        if (!form.dateOfBirth) return "تاريخ الميلاد مطلوب";
        if (!form.nationality) return "الجنسية مطلوبة";
        if (!form.city) return "المدينة مطلوبة";
        if (!form.area) return "المنطقة مطلوبة";
        if (!form.height) return "الطول مطلوب";
        if (!form.weight) return "الوزن مطلوب";
        if (!form.skinColor) return "لون البشرة مطلوب";
        if (!form.education) return "المستوى التعليمي مطلوب";
        if (!form.fieldOfStudy) return "التخصص مطلوب";
        if (!form.job) return "الوظيفة مطلوبة";
        if (form.job === "أخرى" && !form.jobCustom) return "يرجى تحديد الوظيفة";
        if (!form.incomeRange) return "مستوى الدخل مطلوب";
        return "";
      }
      case 2: {
        if (!form.maritalStatus) return "الحالة الاجتماعية مطلوبة";
        if (form.maritalStatus !== "أعزب/عزباء" && form.childrenCount === "") return "عدد الأبناء مطلوب";
        if (!form.religiosity) return "مستوى التدين مطلوب";
        if (!form.smokingStatus) return "حالة التدخين مطلوبة";
        if (!form.cookingAbility) return "مهارة الطبخ مطلوبة";
        if (!form.lifestyle) return "نمط الحياة مطلوب";
        return "";
      }
      case 3: {
        if (!form.aboutMe) return "نبذة عنك مطلوبة";
        if (!form.partnerExpectations) return "مواصفات الشريك مطلوبة";
        if (!form.hobbies) return "الهوايات مطلوبة";
        if (!form.interests) return "الاهتمامات مطلوبة";
        if (!form.familyValues) return "القيم العائلية مطلوبة";
        if (!form.prefAgeMin) return "العمر الأدنى مطلوب";
        if (!form.prefAgeMax) return "العمر الأقصى مطلوب";
        if (form.prefCity.length === 0) return "اختر مدينة مفضلة واحدة على الأقل";
        if (form.prefEducation.length === 0) return "اختر مستوى تعليمي مفضل واحد على الأقل";
        if (form.prefMaritalStatus.length === 0) return "اختر حالة اجتماعية مفضلة واحدة على الأقل";
        if (!form.willingToRelocate) return "الاستعداد للانتقال مطلوب";
        return "";
      }
      case 4: {
        if (!form.tribe) return "العشيرة مطلوبة";
        if (!form.familyOriginArea) return "منطقة أصل العائلة مطلوبة";
        if (form.numberOfSiblings === "") return "عدد الإخوة والأخوات مطلوب";
        if (!form.housingType) return "نوع السكن مطلوب";
        if (!form.monthlyExpenses) return "المصاريف الشهرية مطلوبة";
        if (!form.healthConditions) return "الحالات الصحية مطلوبة";
        return "";
      }
      case 5: {
        if (!parentForm.parentName) return "اسم ولي الأمر مطلوب";
        if (!parentForm.parentPhone) return "رقم هاتف ولي الأمر مطلوب";
        if (!parentForm.relationship) return "صلة القرابة مطلوبة";
        if (!parentForm.address) return "العنوان مطلوب";
        return "";
      }
      default:
        return "";
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      // Save profile data
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          job: form.job === "أخرى" ? form.jobCustom : form.job,
          jobCustom: undefined,
          height: form.height ? parseInt(form.height) : undefined,
          weight: form.weight ? parseInt(form.weight) : undefined,
          numberOfSiblings: form.numberOfSiblings ? parseInt(form.numberOfSiblings) : undefined,
          childrenCount: form.maritalStatus === "أعزب/عزباء" ? 0 : (form.childrenCount ? parseInt(form.childrenCount) : 0),
          prefAgeMin: form.prefAgeMin ? parseInt(form.prefAgeMin) : undefined,
          prefAgeMax: form.prefAgeMax ? parseInt(form.prefAgeMax) : undefined,
          prefHijab: form.prefHijab || undefined,
          prefBeard: form.prefBeard || undefined,
          prefReligiosity: form.prefReligiosity.length > 0 ? form.prefReligiosity : undefined,
          prefSmokingStatus: form.prefSmokingStatus.length > 0 ? form.prefSmokingStatus : undefined,
          prefChildrenAcceptance: form.prefChildrenAcceptance || undefined,
        }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error || "حدث خطأ أثناء حفظ الملف الشخصي");
        return;
      }

      // Save parent/guardian info
      const parentRes = await fetch("/api/profile/parent-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parentForm),
      });

      if (!parentRes.ok) {
        const data = await parentRes.json();
        setError(data.error || "حدث خطأ أثناء حفظ بيانات ولي الأمر");
        return;
      }

      router.push("/dashboard/profile");
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  const totalSteps = 5;
  const availableAreas = form.city ? (jordanAreas[form.city] || []) : [];

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

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
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
                <Label>تاريخ الميلاد</Label>
                <Input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>الجنسية</Label>
                <Input value={form.nationality} onChange={(e) => update("nationality", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>المدينة</Label>
              <div className="grid grid-cols-3 gap-2">
                {jordanCities.map((c) => (
                  <button key={c} type="button" onClick={() => handleCityChange(c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.city === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{c}</button>
                ))}
              </div>
            </div>

            {form.city && availableAreas.length > 0 && (
              <div className="space-y-2">
                <Label>المنطقة</Label>
                <select
                  value={form.area}
                  onChange={(e) => update("area", e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">اختر المنطقة...</option>
                  {availableAreas.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الطول (سم)</Label>
                <Input type="number" value={form.height} onChange={(e) => update("height", e.target.value)} placeholder="170" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>الوزن (كغ)</Label>
                <Input type="number" value={form.weight} onChange={(e) => update("weight", e.target.value)} placeholder="70" dir="ltr" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>لون البشرة</Label>
              <div className="grid grid-cols-4 gap-2">
                {skinColors.map((c) => (
                  <button key={c} type="button" onClick={() => update("skinColor", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.skinColor === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>المستوى التعليمي</Label>
              <div className="grid grid-cols-3 gap-2">
                {educationLevels.map((e) => (
                  <button key={e} type="button" onClick={() => update("education", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.education === e ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{e}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>التخصص</Label>
              <Input value={form.fieldOfStudy} onChange={(e) => update("fieldOfStudy", e.target.value)} placeholder="مثال: هندسة حاسوب، محاسبة، طب..." />
            </div>

            <div className="space-y-2">
              <Label>الوظيفة</Label>
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
                <Input value={form.jobCustom} onChange={(e) => update("jobCustom", e.target.value)} placeholder="حدد وظيفتك..." className="mt-2" />
              )}
            </div>

            <div className="space-y-2">
              <Label>مستوى الدخل</Label>
              <div className="grid grid-cols-3 gap-2">
                {incomeRanges.map((r) => (
                  <button key={r} type="button" onClick={() => update("incomeRange", r)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.incomeRange === r ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{r}</button>
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
              <Label>الحالة الاجتماعية</Label>
              <div className="grid grid-cols-3 gap-2">
                {maritalStatuses.map((s) => (
                  <button key={s} type="button" onClick={() => {
                    update("maritalStatus", s);
                    if (s === "أعزب/عزباء") update("childrenCount", "0");
                  }}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.maritalStatus === s ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            {form.maritalStatus !== "أعزب/عزباء" && (
              <div className="space-y-2">
                <Label>عدد الأبناء</Label>
                <Input type="number" value={form.childrenCount} onChange={(e) => update("childrenCount", e.target.value)} placeholder="0" min={0} max={20} dir="ltr" />
              </div>
            )}

            <div className="space-y-2">
              <Label>مستوى التدين</Label>
              <div className="grid grid-cols-2 gap-2">
                {religiosityLevels.map((r) => (
                  <button key={r} type="button" onClick={() => update("religiosity", r)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.religiosity === r ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{r}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>التدخين</Label>
              <div className="grid grid-cols-2 gap-2">
                {smokingStatuses.map((s) => (
                  <button key={s} type="button" onClick={() => update("smokingStatus", s)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.smokingStatus === s ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{s}</button>
                ))}
              </div>
            </div>

            {/* Gender-specific: hijab for women, beard for men */}
            {gender === "FEMALE" && (
              <div className="space-y-2">
                <Label>الحجاب</Label>
                <button
                  type="button"
                  onClick={() => update("hijab", !form.hijab)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm transition-all flex items-center justify-between ${form.hijab ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                >
                  <span>محجبة</span>
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.hijab ? "bg-primary" : "bg-muted"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.hijab ? "translate-x-1" : "translate-x-5"}`} />
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
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.beard ? "bg-primary" : "bg-muted"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.beard ? "translate-x-1" : "translate-x-5"}`} />
                  </div>
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label>مهارة الطبخ</Label>
              <div className="grid grid-cols-2 gap-2">
                {cookingLevels.map((c) => (
                  <button key={c} type="button" onClick={() => update("cookingAbility", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.cookingAbility === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>نمط الحياة</Label>
              <div className="grid grid-cols-4 gap-2">
                {lifestyleOptions.map((l) => (
                  <button key={l} type="button" onClick={() => update("lifestyle", l)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.lifestyle === l ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{l}</button>
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
                <div className={`w-10 h-5 rounded-full transition-colors ${form.drivingLicense ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${form.drivingLicense ? "translate-x-1" : "translate-x-5"}`} />
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
            <CardDescription>أخبرنا عنك وعن الشريك المثالي</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>نبذة عني</Label>
              <textarea
                value={form.aboutMe}
                onChange={(e) => update("aboutMe", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="تحدث عن نفسك واهتماماتك وطموحاتك..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.aboutMe.length}/500</p>
            </div>

            <div className="space-y-2">
              <Label>مواصفات الشريك المطلوبة</Label>
              <textarea
                value={form.partnerExpectations}
                onChange={(e) => update("partnerExpectations", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="صف المواصفات التي تبحث عنها في شريك حياتك..."
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.partnerExpectations.length}/500</p>
            </div>

            <div className="space-y-2">
              <Label>الهوايات</Label>
              <Input value={form.hobbies} onChange={(e) => update("hobbies", e.target.value)} placeholder="مثال: القراءة، الرياضة، السفر..." />
            </div>

            <div className="space-y-2">
              <Label>الاهتمامات</Label>
              <Input value={form.interests} onChange={(e) => update("interests", e.target.value)} placeholder="مثال: التكنولوجيا، الطبخ، التصوير..." />
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
              <p className="text-xs text-muted-foreground text-left" dir="ltr">{form.familyValues.length}/500</p>
            </div>

            {/* Preferences section */}
            <div className="pt-4 border-t">
              <h3 className="text-base font-semibold mb-3">تفضيلات الشريك</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>العمر الأدنى</Label>
                <Input type="number" value={form.prefAgeMin} onChange={(e) => update("prefAgeMin", e.target.value)} placeholder="18" min={18} max={70} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>العمر الأقصى</Label>
                <Input type="number" value={form.prefAgeMax} onChange={(e) => update("prefAgeMax", e.target.value)} placeholder="40" min={18} max={70} dir="ltr" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>المدن المفضلة <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من مدينة)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {jordanCities.map((c) => (
                  <button key={c} type="button" onClick={() => toggleArray("prefCity", c)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefCity.includes(c) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>المستوى التعليمي المفضل <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من مستوى)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {educationLevels.map((e) => (
                  <button key={e} type="button" onClick={() => toggleArray("prefEducation", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefEducation.includes(e) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{e}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>الحالة الاجتماعية المفضلة <span className="text-xs text-muted-foreground">(يمكن اختيار أكثر من حالة)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {maritalStatuses.map((s) => (
                  <button key={s} type="button" onClick={() => toggleArray("prefMaritalStatus", s)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.prefMaritalStatus.includes(s) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{s}</button>
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
              <Label>قبول وجود أبناء من زواج سابق</Label>
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
                  <button key={r.value} type="button" onClick={() => update("willingToRelocate", r.value)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.willingToRelocate === r.value ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{r.label}</button>
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
            <CardDescription>بيانات إضافية عن العائلة والسكن</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>العشيرة</Label>
              <Input value={form.tribe} onChange={(e) => update("tribe", e.target.value)} placeholder="اسم العشيرة" />
            </div>

            <div className="space-y-2">
              <Label>منطقة أصل العائلة</Label>
              <Input value={form.familyOriginArea} onChange={(e) => update("familyOriginArea", e.target.value)} placeholder="منطقة أصل العائلة" />
            </div>

            <div className="space-y-2">
              <Label>عدد الإخوة والأخوات</Label>
              <Input type="number" value={form.numberOfSiblings} onChange={(e) => update("numberOfSiblings", e.target.value)} placeholder="0" min={0} max={20} dir="ltr" />
            </div>

            <div className="space-y-2">
              <Label>نوع السكن</Label>
              <div className="grid grid-cols-3 gap-2">
                {housingTypes.map((h) => (
                  <button key={h} type="button" onClick={() => update("housingType", h)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.housingType === h ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{h}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>المصاريف الشهرية</Label>
              <div className="grid grid-cols-2 gap-2">
                {expenseRanges.map((e) => (
                  <button key={e} type="button" onClick={() => update("monthlyExpenses", e)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${form.monthlyExpenses === e ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                  >{e}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>حالات صحية</Label>
              <textarea
                value={form.healthConditions}
                onChange={(e) => update("healthConditions", e.target.value)}
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
            <CardTitle>بيانات ولي الأمر</CardTitle>
            <CardDescription>هذه البيانات مطلوبة لتنسيق الزيارات العائلية ولن تظهر للمستخدمين الآخرين</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="parentName">اسم ولي الأمر</Label>
              <Input
                id="parentName"
                value={parentForm.parentName}
                onChange={(e) => updateParent("parentName", e.target.value)}
                placeholder="الاسم الكامل لولي الأمر"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parentPhone">رقم هاتف ولي الأمر</Label>
              <Input
                id="parentPhone"
                type="tel"
                value={parentForm.parentPhone}
                onChange={(e) => updateParent("parentPhone", e.target.value)}
                placeholder="07XXXXXXXX"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-2">
              <Label>صلة القرابة</Label>
              <div className="grid grid-cols-2 gap-2">
                {guardianRelationships.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => updateParent("relationship", r.value)}
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                      parentForm.relationship === r.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">العنوان</Label>
              <textarea
                id="address"
                value={parentForm.address}
                onChange={(e) => updateParent("address", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="العنوان التفصيلي (المدينة، الحي، الشارع...)"
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-lg text-sm text-muted-foreground">
              <span>هذه البيانات سرية وتستخدم فقط من قبل الإدارة لتنسيق الزيارات العائلية</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            <ArrowRight className="h-4 w-4 me-2" />
            السابق
          </Button>
        ) : (
          <div />
        )}

        {step < totalSteps ? (
          <Button onClick={() => {
            const err = validateStep(step);
            if (err) { setError(err); return; }
            setError("");
            setStep(step + 1);
          }} className="bg-gradient-to-l from-primary to-primary/80">
            التالي
            <ArrowLeft className="h-4 w-4 ms-2" />
          </Button>
        ) : (
          <Button onClick={() => {
            const err = validateStep(step);
            if (err) { setError(err); return; }
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
