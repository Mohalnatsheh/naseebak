"use client";

import { useState, useEffect, useRef } from "react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { selfLabel } from "@/lib/profile-options";
import Link from "next/link";
import {
  Loader2,
  User,
  Send,
  MapPin,
  GraduationCap,
  Briefcase,
  Heart,
  Shield,
  Brain,
  Ban,
  ChevronLeft,
  Sparkles,
  Star,
  CheckCircle2,
  AlertCircle,
  Quote,
  Calendar,
  Moon,
  Clock,
  Camera,
  Lock,
  Trash2,
  Ruler,
  Weight,
  Palette,
  Baby,
  Cigarette,
  ChefHat,
  Car,
  Globe,
  Wallet,
  Home as HomeIcon,
  Users,
  HeartHandshake,
  Activity,
  BookOpen,
  Target,
  Gamepad2,
  TreePine,
  Scaling,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/* eslint-disable @typescript-eslint/no-explicit-any */

const relationshipLabels: Record<string, string> = {
  father: "الأب",
  mother: "الأم",
  brother: "الأخ",
  guardian: "ولي الأمر",
};

/* ------------------------------------------------------------------ */
/*  Profile completion ring (SVG circle)                               */
/* ------------------------------------------------------------------ */
function CompletionRing({
  percentage,
  size = 90,
}: {
  percentage: number;
  size?: number;
}) {
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#profile-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient
            id="profile-ring-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold text-foreground">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable info field row                                            */
/* ------------------------------------------------------------------ */
function InfoField({
  icon: Icon,
  label,
  value,
  gradient = "from-primary/10 to-primary/5",
  iconColor = "text-primary",
  colSpan,
}: {
  icon: any;
  label: string;
  value: string | number;
  gradient?: string;
  iconColor?: string;
  colSpan?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors ${
        colSpan ? "sm:col-span-2" : ""
      }`}
    >
      <div
        className={`h-10 w-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section card wrapper                                               */
/* ------------------------------------------------------------------ */
function SectionCard({
  icon: Icon,
  title,
  gradient = "from-primary to-primary/50",
  iconGradient = "from-primary/10 to-primary/5",
  iconColor = "text-primary",
  children,
  delay = "0.2s",
}: {
  icon: any;
  title: string;
  gradient?: string;
  iconGradient?: string;
  iconColor?: string;
  children: React.ReactNode;
  delay?: string;
}) {
  return (
    <div style={{ animation: `fadeSlideIn 0.5s ease-out ${delay} both` }}>
      <Card className="overflow-hidden border-border/40 shadow-sm">
        <div className={`h-1 bg-gradient-to-l ${gradient}`} />
        <CardContent className="p-5 md:p-6">
          <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-lg bg-gradient-to-br ${iconGradient} flex items-center justify-center`}
            >
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
            {title}
          </h2>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  const introMode = useDashboardData().counts.flags.introRequests;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completeness, setCompleteness] = useState<any>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [pendingRequest, setPendingRequest] = useState<{
    id: string;
    status: string;
    createdAt: string;
  } | null>(null);
  const [deletionRequest, setDeletionRequest] = useState<{
    scheduledAt: string;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletionLoading, setDeletionLoading] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        setUser(data.user);
        if (data.completeness) setCompleteness(data.completeness);
      } catch (err) {
        console.error("Failed to fetch profile", err);
      } finally {
        setLoading(false);
      }
    }
    async function fetchPendingRequest() {
      try {
        const res = await fetch("/api/profile/update-request");
        const data = await res.json();
        const pending = data.requests?.find(
          (r: { status: string }) => r.status === "PENDING"
        );
        if (pending) setPendingRequest(pending);
      } catch {
        // Silently fail
      }
    }
    async function fetchDeletionStatus() {
      try {
        const res = await fetch("/api/profile/delete");
        const data = await res.json();
        if (data.hasPendingDeletion) {
          setDeletionRequest(data.deletionRequest);
        }
      } catch {
        // Silently fail
      }
    }
    fetchProfile();
    fetchPendingRequest();
    fetchDeletionStatus();
  }, []);

  async function handleAvatarUpload(file: File) {
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) return;

    setAvatarUploading(true);
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser((prev: any) =>
          prev
            ? {
                ...prev,
                profile: prev.profile
                  ? { ...prev.profile, profileImageUrl: data.profileImageUrl }
                  : prev.profile,
              }
            : prev
        );
      }
    } catch (err) {
      console.error("Avatar upload failed", err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          جاري تحميل الملف الشخصي...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-full animate-pulse" />
          <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-primary/[0.03] flex items-center justify-center border-2 border-dashed border-primary/20">
            <User className="h-10 w-10 text-muted-foreground/40" />
          </div>
        </div>
        <p className="text-muted-foreground font-medium">
          لم يتم العثور على الملف الشخصي
        </p>
      </div>
    );
  }

  const p = user.profile;
  const completionPct = completeness?.total ?? 0;
  const totalMatches =
    user._count.matchesAsFemale + user._count.matchesAsMale;
  const isMale = user.gender === "MALE";

  // Calculate age from date of birth
  const getAge = (dob: string) => {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  // Check if any fields in a section have values
  const hasPersonalInfo = p && (p.dateOfBirth || p.nationality || p.city || p.area || p.height || p.weight || p.skinColor || p.education || p.fieldOfStudy || p.job || p.incomeRange);
  const hasLifestyle = p && (p.maritalStatus || p.religiosity || p.smokingStatus || p.hijab !== null || p.beard !== null || p.cookingAbility || p.drivingLicense !== null || p.childrenCount > 0);
  const hasAboutSection = p && (p.aboutMe || p.partnerExpectations || p.hobbies || p.interests || p.familyValues || p.lifestyle);
  const hasFamilyInfo = p && (p.tribe || p.familyOriginArea || p.numberOfSiblings !== null || p.housingType || p.monthlyExpenses || p.healthConditions);
  const hasPreferences = p && (p.prefAgeMin || p.prefAgeMax || (p.prefCity && p.prefCity.length > 0) || (p.prefEducation && p.prefEducation.length > 0) || (p.prefMaritalStatus && p.prefMaritalStatus.length > 0) || (p.prefReligiosity && p.prefReligiosity.length > 0) || (p.prefSmokingStatus && p.prefSmokingStatus.length > 0) || p.prefHijab || p.prefBeard || p.prefChildrenAcceptance);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* ============================================ */}
      {/*  Profile Header Banner                       */}
      {/* ============================================ */}
      <div
        className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-primary via-primary/90 to-primary/80 p-6 sm:p-8 text-primary-foreground shadow-xl shadow-primary/15"
        style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
      >
        <div className="absolute top-0 left-0 h-40 w-40 rounded-full bg-white/5 blur-2xl -translate-x-12 -translate-y-12" />
        <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-white/5 blur-2xl translate-x-8 translate-y-8" />
        <div className="absolute top-1/2 left-1/3 h-24 w-24 rounded-full bg-accent/10 blur-xl" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="relative group/avatar">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                }}
              />
              <div className="h-20 w-20 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg overflow-hidden">
                {p?.profileImageUrl ? (
                  <img
                    src={p.profileImageUrl}
                    alt="صورة الملف الشخصي"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-extrabold text-white">
                    {user.firstName.charAt(0)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-all duration-300 flex items-center justify-center cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              {/* Touch screens have no hover: always-visible camera badge */}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="تغيير الصورة"
                className="absolute -bottom-1.5 -start-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-card text-primary shadow-md ring-2 ring-primary md:hidden"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              {user.identityDoc?.status === "APPROVED" && (
                <div className="absolute -bottom-1.5 -end-1.5 h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-md ring-2 ring-primary">
                  <Shield className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                {user.firstName} {user.lastName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-white/15 text-white/90 border border-white/20">
                  {isMale ? "ذكر" : "أنثى"}
                </span>
                {p?.dateOfBirth && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white/90 border border-white/20 px-3 py-1 text-xs font-bold">
                    {getAge(p.dateOfBirth)} سنة
                  </span>
                )}
                {user.identityDoc?.status === "APPROVED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white/90 border border-white/20 px-3 py-1 text-xs font-bold">
                    <Shield className="h-3 w-3" />
                    موثّق
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 self-start sm:self-auto">
            {!p?.isComplete && (
              <Button
                asChild
                className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Link href="/dashboard/profile/setup">إكمال الملف</Link>
              </Button>
            )}
            {p?.isComplete && (
              <Button
                asChild
                className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Link href="/dashboard/profile/edit">
                  <Send className="h-4 w-4 me-2" />
                  طلب تعديل
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Avatar privacy note */}
      <div className="flex items-center gap-3 p-3 bg-gradient-to-l from-primary/5 to-primary/[0.03] rounded-xl border border-primary/10 text-sm text-muted-foreground">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Lock className="h-4 w-4 text-primary" />
        </div>
        <span className="leading-relaxed text-xs">
          صورة الملف الشخصي تظهر لك فقط ولن يراها أي مستخدم آخر
        </span>
      </div>

      {/* ============================================ */}
      {/*  Completion Section                          */}
      {/* ============================================ */}
      {completionPct < 100 && completeness && (
        <Card
          className="relative overflow-hidden border-accent/30 bg-gradient-to-l from-accent/8 to-accent/3 shadow-md"
          style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-accent/10 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-5 mb-4">
              <CompletionRing percentage={completionPct} />
              <div className="flex-1">
                <h3 className="font-bold text-foreground text-base">
                  أكمل ملفك الشخصي
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  كلما زادت نسبة الاكتمال، زادت جودة الاقتراحات
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              {completeness.sections.map((section: any) => (
                <Link key={section.key} href={section.link} className="block">
                  <div
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                      section.percentage === 100
                        ? "bg-emerald-50/60 border-emerald-200/50"
                        : "bg-accent/5 border-accent/20 hover:bg-accent/8"
                    }`}
                  >
                    {section.percentage === 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-accent-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-medium ${
                            section.percentage === 100
                              ? "text-emerald-800"
                              : "text-foreground"
                          }`}
                        >
                          {section.label}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            section.percentage === 100
                              ? "text-emerald-600"
                              : "text-accent-foreground"
                          }`}
                        >
                          {section.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            section.percentage === 100
                              ? "bg-emerald-500"
                              : "bg-accent"
                          }`}
                          style={{ width: `${section.percentage}%` }}
                        />
                      </div>
                      {section.missingFields.length > 0 &&
                        section.percentage < 100 && (
                          <p className="text-[10px] text-muted-foreground mt-1 truncate">
                            ينقص:{" "}
                            {section.missingFields.slice(0, 3).join("، ")}
                            {section.missingFields.length > 3 &&
                              ` (+${section.missingFields.length - 3})`}
                          </p>
                        )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {completionPct === 100 && (
        <Card
          className="relative overflow-hidden border-emerald-200/60 bg-gradient-to-l from-emerald-50/80 to-emerald-50/30 shadow-md"
          style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-emerald-100/20 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-5">
              <CompletionRing percentage={completionPct} />
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-emerald-900 text-base">
                  ملفك الشخصي مكتمل
                </h3>
                <p className="text-sm text-emerald-700/80 leading-relaxed">
                  ملفك الشخصي مكتمل بالكامل. أنت مؤهل للحصول على أفضل
                  الاقتراحات!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/*  Personal Information                        */}
      {/* ============================================ */}
      {hasPersonalInfo && (
        <SectionCard
          icon={User}
          title="المعلومات الشخصية"
          gradient="from-primary to-primary/50"
          delay="0.15s"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.dateOfBirth && (
              <InfoField
                icon={Calendar}
                label="تاريخ الميلاد"
                value={`${new Date(p.dateOfBirth).toLocaleDateString("ar-JO-u-nu-latn")} (${getAge(p.dateOfBirth)} سنة)`}
                gradient="from-primary/10 to-secondary/5"
              />
            )}
            {p.nationality && (
              <InfoField
                icon={Globe}
                label="الجنسية"
                value={p.nationality}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.city && (
              <InfoField
                icon={MapPin}
                label="المدينة"
                value={p.city}
              />
            )}
            {p.area && (
              <InfoField
                icon={MapPin}
                label="المنطقة"
                value={p.area}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.height && (
              <InfoField
                icon={Ruler}
                label="الطول"
                value={`${p.height} سم`}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.weight && (
              <InfoField
                icon={Weight}
                label="الوزن"
                value={`${p.weight} كغ`}
              />
            )}
            {p.skinColor && (
              <InfoField
                icon={Palette}
                label="لون البشرة"
                value={p.skinColor}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.education && (
              <InfoField
                icon={GraduationCap}
                label="المستوى التعليمي"
                value={p.education}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.fieldOfStudy && (
              <InfoField
                icon={BookOpen}
                label="التخصص"
                value={p.fieldOfStudy}
              />
            )}
            {p.job && (
              <InfoField
                icon={Briefcase}
                label="الوظيفة"
                value={selfLabel("job", p.job, user.gender)}
              />
            )}
            {p.incomeRange && (
              <InfoField
                icon={Wallet}
                label="الدخل الشهري"
                value={p.incomeRange}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  Lifestyle & Religion                        */}
      {/* ============================================ */}
      {hasLifestyle && (
        <SectionCard
          icon={Moon}
          title="نمط الحياة والدين"
          gradient="from-accent to-accent/50"
          iconGradient="from-accent/10 to-accent/5"
          iconColor="text-accent-foreground"
          delay="0.2s"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.maritalStatus && (
              <InfoField
                icon={Heart}
                label="الحالة الاجتماعية"
                value={selfLabel("maritalStatus", p.maritalStatus, user.gender)}
                gradient="from-primary/10 to-secondary/5"
              />
            )}
            {p.childrenCount > 0 && (
              <InfoField
                icon={Baby}
                label="عدد الأطفال"
                value={p.childrenCount}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.religiosity && (
              <InfoField
                icon={Moon}
                label="الالتزام الديني"
                value={selfLabel("religiosity", p.religiosity, user.gender)}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.smokingStatus && (
              <InfoField
                icon={Cigarette}
                label="التدخين"
                value={selfLabel("smokingStatus", p.smokingStatus, user.gender)}
              />
            )}
            {!isMale && p.hijab !== null && p.hijab !== undefined && (
              <InfoField
                icon={User}
                label="الحجاب"
                value={p.hijab ? "محجبة" : "غير محجبة"}
                gradient="from-primary/10 to-secondary/5"
              />
            )}
            {isMale && p.beard !== null && p.beard !== undefined && (
              <InfoField
                icon={User}
                label="اللحية"
                value={p.beard ? "ملتحي" : "غير ملتحي"}
                gradient="from-primary/10 to-secondary/5"
              />
            )}
            {p.cookingAbility && (
              <InfoField
                icon={ChefHat}
                label="الطبخ"
                value={selfLabel("cookingAbility", p.cookingAbility, user.gender)}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.drivingLicense !== null && p.drivingLicense !== undefined && (
              <InfoField
                icon={Car}
                label="رخصة القيادة"
                value={p.drivingLicense ? "يوجد" : "لا يوجد"}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  About Me & Expectations                     */}
      {/* ============================================ */}
      {hasAboutSection && (
        <SectionCard
          icon={Quote}
          title="نبذة عني وتطلعاتي"
          gradient="from-primary to-secondary"
          iconGradient="from-primary/10 to-secondary/10"
          delay="0.25s"
        >
          <div className="space-y-4">
            {p.aboutMe && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Quote className="h-3 w-3" />
                  نبذة عني
                </p>
                <div className="relative bg-gradient-to-l from-primary/5 to-secondary/5 rounded-xl p-4 border border-primary/10">
                  <div className="absolute top-2 end-3 text-primary/10">
                    <Quote className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed relative z-10">
                    {p.aboutMe}
                  </p>
                </div>
              </div>
            )}
            {p.partnerExpectations && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Target className="h-3 w-3" />
                  تطلعاتي في شريك الحياة
                </p>
                <div className="relative bg-gradient-to-l from-accent/5 to-accent/[0.03] rounded-xl p-4 border border-accent/10">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {p.partnerExpectations}
                  </p>
                </div>
              </div>
            )}
            {p.hobbies && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Gamepad2 className="h-3 w-3" />
                  الهوايات
                </p>
                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {p.hobbies}
                  </p>
                </div>
              </div>
            )}
            {p.interests && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  الاهتمامات
                </p>
                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {p.interests}
                  </p>
                </div>
              </div>
            )}
            {p.familyValues && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <HeartHandshake className="h-3 w-3" />
                  القيم العائلية
                </p>
                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {p.familyValues}
                  </p>
                </div>
              </div>
            )}
            {p.lifestyle && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <TreePine className="h-3 w-3" />
                  نمط الحياة
                </p>
                <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {selfLabel("lifestyle", p.lifestyle, user.gender)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  Family Information                          */}
      {/* ============================================ */}
      {hasFamilyInfo && (
        <SectionCard
          icon={Users}
          title="معلومات العائلة"
          gradient="from-secondary to-primary"
          iconGradient="from-secondary/10 to-primary/5"
          iconColor="text-secondary"
          delay="0.3s"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.tribe && (
              <InfoField
                icon={Users}
                label="العشيرة"
                value={p.tribe}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.familyOriginArea && (
              <InfoField
                icon={MapPin}
                label="منطقة الأصل"
                value={p.familyOriginArea}
              />
            )}
            {p.numberOfSiblings !== null && p.numberOfSiblings !== undefined && (
              <InfoField
                icon={Users}
                label="عدد الإخوة"
                value={p.numberOfSiblings}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.housingType && (
              <InfoField
                icon={HomeIcon}
                label="نوع السكن"
                value={p.housingType}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.monthlyExpenses && (
              <InfoField
                icon={Wallet}
                label="المصاريف الشهرية"
                value={p.monthlyExpenses}
              />
            )}
            {p.healthConditions && (
              <InfoField
                icon={Activity}
                label="الحالة الصحية"
                value={p.healthConditions}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
                colSpan
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  Partner Preferences                         */}
      {/* ============================================ */}
      {hasPreferences && (
        <SectionCard
          icon={Scaling}
          title="تفضيلات شريك الحياة"
          gradient="from-primary to-accent"
          iconGradient="from-primary/10 to-accent/10"
          delay="0.35s"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(p.prefAgeMin || p.prefAgeMax) && (
              <InfoField
                icon={Calendar}
                label="العمر المفضل"
                value={
                  p.prefAgeMin && p.prefAgeMax
                    ? `${p.prefAgeMin} - ${p.prefAgeMax} سنة`
                    : p.prefAgeMin
                      ? `من ${p.prefAgeMin} سنة`
                      : `حتى ${p.prefAgeMax} سنة`
                }
                gradient="from-primary/10 to-secondary/5"
              />
            )}
            {p.prefCity && p.prefCity.length > 0 && (
              <InfoField
                icon={MapPin}
                label="المدن المفضلة"
                value={p.prefCity.join("، ")}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.prefEducation && p.prefEducation.length > 0 && (
              <InfoField
                icon={GraduationCap}
                label="التعليم المفضل"
                value={p.prefEducation.join("، ")}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.prefMaritalStatus && p.prefMaritalStatus.length > 0 && (
              <InfoField
                icon={Heart}
                label="الحالة الاجتماعية المفضلة"
                value={p.prefMaritalStatus.join("، ")}
              />
            )}
            {p.prefReligiosity && p.prefReligiosity.length > 0 && (
              <InfoField
                icon={Moon}
                label="الالتزام الديني المفضل"
                value={p.prefReligiosity.join("، ")}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
            {p.prefSmokingStatus && p.prefSmokingStatus.length > 0 && (
              <InfoField
                icon={Cigarette}
                label="التدخين المفضل"
                value={p.prefSmokingStatus.join("، ")}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {isMale && p.prefHijab && (
              <InfoField
                icon={User}
                label="الحجاب المفضل"
                value={p.prefHijab}
              />
            )}
            {!isMale && p.prefBeard && (
              <InfoField
                icon={User}
                label="اللحية المفضلة"
                value={p.prefBeard}
                gradient="from-secondary/10 to-primary/5"
                iconColor="text-secondary"
              />
            )}
            {p.prefChildrenAcceptance && (
              <InfoField
                icon={Baby}
                label="قبول وجود أطفال"
                value={p.prefChildrenAcceptance}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  Guardian Info                                */}
      {/* ============================================ */}
      {user.parentInfo && (
        <SectionCard
          icon={Shield}
          title="معلومات ولي الأمر"
          gradient="from-primary to-secondary"
          delay="0.4s"
        >
          <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 p-3 mb-4">
            <Lock className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
            <p className="text-xs text-primary leading-relaxed">
              {introMode
                ? "بيانات وليّ الأمر سرية، ولا تظهر لأي مستخدم إلا لعائلة الطرف الآخر بعد قبول طلب التعارف العائلي وبموافقتك."
                : "هذه البيانات سرية ولن تظهر لأي مستخدم آخر. تُستخدم فقط لتنسيق الزيارات العائلية."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoField
              icon={User}
              label="اسم ولي الأمر"
              value={user.parentInfo.parentName}
            />
            <InfoField
              icon={Heart}
              label="صلة القرابة"
              value={
                relationshipLabels[user.parentInfo.relationship] ||
                user.parentInfo.relationship
              }
              gradient="from-secondary/10 to-primary/5"
              iconColor="text-secondary"
            />
            {user.parentInfo.address && (
              <InfoField
                icon={MapPin}
                label="العنوان"
                value={user.parentInfo.address}
                gradient="from-accent/10 to-accent/5"
                iconColor="text-accent-foreground"
                colSpan
              />
            )}
          </div>
        </SectionCard>
      )}

      {/* ============================================ */}
      {/*  Stats Grid                                  */}
      {/* ============================================ */}
      <div
        className="grid grid-cols-3 gap-3 sm:gap-4"
        style={{ animation: "fadeSlideIn 0.5s ease-out 0.45s both" }}
      >
        {[
          {
            value: user.matchCredits,
            label: introMode ? "رصيد التعارف" : "رصيد الاقتراحات",
            icon: Sparkles,
            gradient: "from-primary to-secondary",
            bgLight: "from-primary/10 to-secondary/10",
            textColor: "text-primary",
            shadowColor: "shadow-primary/10",
          },
          {
            value: user._count.receivedSuggestions,
            label: "اقتراحات مستلمة",
            icon: Star,
            gradient: "from-accent to-accent/70",
            bgLight: "from-accent/10 to-accent/5",
            textColor: "text-accent-foreground",
            shadowColor: "shadow-accent/10",
          },
          {
            value: totalMatches,
            label: "توافقات",
            icon: Heart,
            gradient: "from-secondary to-primary",
            bgLight: "from-secondary/10 to-primary/10",
            textColor: "text-primary",
            shadowColor: "shadow-primary/10",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className={`group relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgLight} hover:shadow-lg ${stat.shadowColor} transition-all duration-300 hover:-translate-y-1`}
          >
            <CardContent className="pt-5 pb-4 px-4 text-center relative">
              <div className="absolute -top-6 -left-6 h-16 w-16 rounded-full bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity" />
              <div
                className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <p
                className={`text-3xl font-extrabold ${stat.textColor} mb-0.5`}
              >
                {stat.value}
              </p>
              <p className="text-[11px] font-medium text-muted-foreground">
                {stat.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ============================================ */}
      {/*  Quick Links                                 */}
      {/* ============================================ */}
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.5s both" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              href: "/dashboard/personality-quiz",
              icon: Brain,
              label: "اختبار الشخصية",
              desc: user.personalityResult
                ? `النتيجة: ${user.personalityResult.personalityType}`
                : "لم يُجرَ بعد",
              gradient: "from-primary to-secondary",
              hoverBorder: "hover:border-primary/30",
            },
            {
              href: "/dashboard/photos",
              icon: Camera,
              label: "صوري الشخصية",
              desc: `${user.photos?.length ?? 0} صور مرفوعة`,
              gradient: "from-primary to-primary/70",
              hoverBorder: "hover:border-primary/30",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card
                className={`group relative overflow-hidden border-border/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer ${item.hoverBorder}`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-l ${item.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`}
                />
                <CardContent className="pt-5 pb-4 flex items-center justify-between relative">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground group-hover:text-foreground/90">
                        {item.label}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:-translate-x-1 transition-all duration-300" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/*  Pending update request banner                */}
      {/* ============================================ */}
      {pendingRequest && (
        <Card
          className="relative overflow-hidden border-primary/20 bg-gradient-to-l from-primary/8 to-primary/3 shadow-sm"
          style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-primary text-sm">
                  طلب تعديل قيد المراجعة
                </h3>
                <p className="text-xs text-primary/80 mt-0.5">
                  تم إرسال طلب تعديل الملف الشخصي. سيتم مراجعته من قبل الإدارة
                  وإعلامك بالنتيجة.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/*  Deactivate Account                          */}
      {/* ============================================ */}
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.55s both" }}>
        <Card className="relative overflow-hidden border-destructive/20 shadow-sm">
          <div className="h-1 bg-gradient-to-l from-destructive/70 to-destructive" />
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center flex-shrink-0">
                  <Ban className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-destructive text-base">
                    تعطيل الحساب
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    سيتم إخفاء ملفك الشخصي ولن تتلقى اقتراحات جديدة. يمكنك
                    إعادة تفعيله لاحقاً.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive/50 shrink-0 rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => setShowDeactivateConfirm(true)}
              >
                <Ban className="h-4 w-4 me-2" />
                تعطيل الحساب
              </Button>
            </div>

            {showDeactivateConfirm && (
              <div className="mt-5 p-5 bg-gradient-to-l from-destructive/5 to-destructive/[0.03] rounded-xl border border-destructive/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    هل أنت متأكد من رغبتك في تعطيل حسابك؟
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم إخفاء ملفك الشخصي من جميع الاقتراحات والبحث. يمكنك إعادة
                  تفعيل حسابك في أي وقت عبر تسجيل الدخول مجددًا.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    disabled={deactivating}
                    className="rounded-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                    onClick={async () => {
                      setDeactivating(true);
                      try {
                        const res = await fetch("/api/profile/deactivate", {
                          method: "POST",
                        });
                        if (res.ok) {
                          window.location.href = "/login?deactivated=true";
                        }
                      } catch {
                        // Error handling
                      } finally {
                        setDeactivating(false);
                      }
                    }}
                  >
                    {deactivating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "نعم، تعطيل الحساب"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl font-semibold"
                    onClick={() => setShowDeactivateConfirm(false)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================ */}
      {/*  Account Deletion (30-day grace period)       */}
      {/* ============================================ */}
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.6s both" }}>
        <Card className="relative overflow-hidden border-destructive/20 shadow-sm">
          <div className="h-1 bg-gradient-to-l from-destructive to-destructive/70" />
          <CardContent className="p-5 md:p-6">
            {deletionRequest ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-bold text-destructive text-base">
                      حذف الحساب قيد التنفيذ
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف حسابك نهائياً في{" "}
                      <span className="font-bold text-destructive">
                        {new Date(
                          deletionRequest.scheduledAt
                        ).toLocaleDateString("ar-JO-u-nu-latn", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      . يمكنك إلغاء الطلب قبل هذا الموعد.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 rounded-xl font-semibold"
                  disabled={deletionLoading}
                  onClick={async () => {
                    setDeletionLoading(true);
                    try {
                      const res = await fetch("/api/profile/delete", {
                        method: "DELETE",
                      });
                      if (res.ok) {
                        setDeletionRequest(null);
                        setShowDeleteConfirm(false);
                      }
                    } catch {
                      // Error handling
                    } finally {
                      setDeletionLoading(false);
                    }
                  }}
                >
                  {deletionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "إلغاء طلب الحذف وتفعيل الحساب"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-bold text-destructive text-base">
                      حذف الحساب نهائياً
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف جميع بياناتك نهائياً بعد 30 يوماً من تقديم
                      الطلب. لا يمكن استعادة البيانات بعد الحذف.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive/50 shrink-0 rounded-xl font-semibold"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  حذف الحساب
                </Button>
              </div>
            )}

            {showDeleteConfirm && !deletionRequest && (
              <div className="mt-5 p-5 bg-gradient-to-l from-destructive/5 to-destructive/[0.03] rounded-xl border border-destructive/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    هل أنت متأكد من رغبتك في حذف حسابك نهائياً؟
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم تعطيل حسابك فوراً وحذفه نهائياً بعد 30 يوماً. يمكنك
                  إلغاء الطلب خلال هذه الفترة.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    سبب الحذف (اختياري)
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm min-h-[60px] resize-none"
                    placeholder="ساعدنا في تحسين المنصة..."
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="destructive"
                    disabled={deletionLoading}
                    className="rounded-xl font-semibold"
                    onClick={async () => {
                      setDeletionLoading(true);
                      try {
                        const res = await fetch("/api/profile/delete", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            reason: deleteReason || undefined,
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setDeletionRequest(data.deletionRequest);
                          setShowDeleteConfirm(false);
                        }
                      } catch {
                        // Error handling
                      } finally {
                        setDeletionLoading(false);
                      }
                    }}
                  >
                    {deletionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "نعم، حذف الحساب"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl font-semibold"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inline keyframes style */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
