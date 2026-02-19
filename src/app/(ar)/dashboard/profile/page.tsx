"use client";

import { useState, useEffect, useRef } from "react";
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
  ImagePlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  isVerified: boolean;
  matchCredits: number;
  profile: {
    city: string | null;
    education: string | null;
    job: string | null;
    maritalStatus: string | null;
    religiosity: string | null;
    aboutMe: string | null;
    isComplete: boolean;
    dateOfBirth: string | null;
    profileImageUrl: string | null;
  } | null;
  personalityResult: {
    personalityType: string | null;
  } | null;
  identityDoc: {
    status: string;
  } | null;
  photos: { id: string; url: string }[];
  _count: {
    receivedSuggestions: number;
    matchesAsFemale: number;
    matchesAsMale: number;
  };
}

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
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        {/* Progress circle */}
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

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [completeness, setCompleteness] = useState<any>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Update request state
  const [pendingRequest, setPendingRequest] = useState<{ id: string; status: string; createdAt: string } | null>(null);
  // Deletion state
  const [deletionRequest, setDeletionRequest] = useState<{ scheduledAt: string } | null>(null);
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
        const pending = data.requests?.find((r: { status: string }) => r.status === "PENDING");
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
        setUser((prev) =>
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
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-blue-200/30 flex items-center justify-center">
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
          <div className="absolute inset-0 bg-gradient-to-br from-rose-100/60 to-primary/10 rounded-full animate-pulse" />
          <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-rose-50 to-primary/5 flex items-center justify-center border-2 border-dashed border-rose-200/50">
            <User className="h-10 w-10 text-muted-foreground/40" />
          </div>
        </div>
        <p className="text-muted-foreground font-medium">
          لم يتم العثور على الملف الشخصي
        </p>
      </div>
    );
  }

  const completionPct = completeness?.total ?? 0;

  const totalMatches =
    user._count.matchesAsFemale + user._count.matchesAsMale;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* ============================================ */}
      {/*  Profile Header Banner                       */}
      {/* ============================================ */}
      <div
        className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-primary via-primary/90 to-primary/80 p-6 sm:p-8 text-primary-foreground shadow-xl shadow-primary/15"
        style={{
          animation: "fadeSlideIn 0.5s ease-out both",
        }}
      >
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 h-40 w-40 rounded-full bg-white/5 blur-2xl -translate-x-12 -translate-y-12" />
        <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-white/5 blur-2xl translate-x-8 translate-y-8" />
        <div className="absolute top-1/2 left-1/3 h-24 w-24 rounded-full bg-accent/10 blur-xl" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            {/* Avatar with profile image or initial */}
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
                {user.profile?.profileImageUrl ? (
                  <img
                    src={user.profile.profileImageUrl}
                    alt="صورة الملف الشخصي"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-extrabold text-white">
                    {user.firstName.charAt(0)}
                  </span>
                )}
              </div>
              {/* Camera overlay */}
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
              {user.identityDoc?.status === "APPROVED" && (
                <div className="absolute -bottom-1.5 -end-1.5 h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-md ring-2 ring-primary">
                  <Shield className="h-3.5 w-3.5 text-white" />
                </div>
              )}
            </div>

            {/* Name and badges */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                {user.firstName} {user.lastName}
              </h1>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    user.gender === "MALE"
                      ? "bg-blue-400/20 text-blue-100 border border-blue-300/20"
                      : "bg-pink-400/20 text-pink-100 border border-pink-300/20"
                  }`}
                >
                  {user.gender === "MALE" ? "ذكر" : "أنثى"}
                </span>
                {user.identityDoc?.status === "APPROVED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-300/20 px-3 py-1 text-xs font-bold">
                    <Shield className="h-3 w-3" />
                    موثّق
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 self-start sm:self-auto">
            {!user.profile?.isComplete && (
              <Button
                asChild
                className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm rounded-xl font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <Link href="/dashboard/profile/setup">إكمال الملف</Link>
              </Button>
            )}
            {user.profile?.isComplete && (
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
      <div className="flex items-center gap-3 p-3 bg-gradient-to-l from-primary/5 to-blue-50/50 rounded-xl border border-primary/10 text-sm text-muted-foreground">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Lock className="h-4 w-4 text-primary" />
        </div>
        <span className="leading-relaxed text-xs">
          صورة الملف الشخصي تظهر لك فقط ولن يراها أي مستخدم آخر
        </span>
      </div>

      {/* ============================================ */}
      {/*  Completion Section — field-level              */}
      {/* ============================================ */}
      {completionPct < 100 && completeness && (
        <Card
          className="relative overflow-hidden border-amber-200/60 bg-gradient-to-l from-amber-50/80 to-orange-50/50 shadow-md"
          style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-amber-200/20 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-5 mb-4">
              <CompletionRing percentage={completionPct} />
              <div className="flex-1">
                <h3 className="font-bold text-amber-900 text-base">
                  أكمل ملفك الشخصي
                </h3>
                <p className="text-xs text-amber-700/80 mt-0.5">
                  كلما زادت نسبة الاكتمال، زادت جودة الاقتراحات
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              {completeness.sections.map((section: any) => (
                <Link key={section.key} href={section.link} className="block">
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                    section.percentage === 100
                      ? "bg-emerald-50/60 border-emerald-200/50"
                      : "bg-amber-50/60 border-amber-200/50 hover:bg-amber-50"
                  }`}>
                    {section.percentage === 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${section.percentage === 100 ? "text-emerald-800" : "text-amber-800"}`}>
                          {section.label}
                        </span>
                        <span className={`text-xs font-bold ${section.percentage === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                          {section.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            section.percentage === 100 ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${section.percentage}%` }}
                        />
                      </div>
                      {section.missingFields.length > 0 && section.percentage < 100 && (
                        <p className="text-[10px] text-amber-600/70 mt-1 truncate">
                          ينقص: {section.missingFields.slice(0, 3).join("، ")}
                          {section.missingFields.length > 3 && ` (+${section.missingFields.length - 3})`}
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
          className="relative overflow-hidden border-emerald-200/60 bg-gradient-to-l from-emerald-50/80 to-green-50/50 shadow-md"
          style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}
        >
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-emerald-200/20 blur-2xl translate-x-8 -translate-y-8" />
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center gap-5">
              <CompletionRing percentage={completionPct} />
              <div className="flex-1 space-y-1">
                <h3 className="font-bold text-emerald-900 text-base">
                  ملفك الشخصي مكتمل
                </h3>
                <p className="text-sm text-emerald-700/80 leading-relaxed">
                  ملفك الشخصي مكتمل بالكامل. أنت مؤهل للحصول على أفضل الاقتراحات!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/*  Info Grid                                   */}
      {/* ============================================ */}
      {user.profile && (
        <div
          style={{
            animation: "fadeSlideIn 0.5s ease-out 0.2s both",
          }}
        >
          <Card className="overflow-hidden border-border/40 shadow-sm">
            <div className="h-1 bg-gradient-to-l from-primary to-primary/50" />
            <CardContent className="p-5 md:p-6">
              <h2 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                المعلومات الأساسية
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {user.profile.city && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        المدينة
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {user.profile.city}
                      </p>
                    </div>
                  </div>
                )}
                {user.profile.education && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        التعليم
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {user.profile.education}
                      </p>
                    </div>
                  </div>
                )}
                {user.profile.job && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        العمل
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {user.profile.job}
                      </p>
                    </div>
                  </div>
                )}
                {user.profile.maritalStatus && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center flex-shrink-0">
                      <Heart className="h-5 w-5 text-rose-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        الحالة الاجتماعية
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {user.profile.maritalStatus}
                      </p>
                    </div>
                  </div>
                )}
                {user.profile.religiosity && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                      <Moon className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        الالتزام الديني
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {user.profile.religiosity}
                      </p>
                    </div>
                  </div>
                )}
                {user.profile.dateOfBirth && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-5 w-5 text-cyan-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        تاريخ الميلاد
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {new Date(user.profile.dateOfBirth).toLocaleDateString(
                          "ar-JO"
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================ */}
      {/*  About Me                                    */}
      {/* ============================================ */}
      {user.profile?.aboutMe && (
        <div
          style={{
            animation: "fadeSlideIn 0.5s ease-out 0.25s both",
          }}
        >
          <Card className="overflow-hidden border-border/40 shadow-sm">
            <div className="h-1 bg-gradient-to-l from-violet-400 to-purple-500" />
            <CardContent className="p-5 md:p-6">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
                  <Quote className="h-4 w-4 text-violet-600" />
                </div>
                نبذة عني
              </h2>
              <div className="relative bg-gradient-to-l from-violet-50/50 to-purple-50/30 rounded-xl p-5 border border-violet-100/50">
                {/* Decorative quote marks */}
                <div className="absolute top-3 end-4 text-violet-200/60">
                  <Quote className="h-8 w-8" />
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed relative z-10">
                  {user.profile.aboutMe}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============================================ */}
      {/*  Stats Grid                                  */}
      {/* ============================================ */}
      <div
        className="grid grid-cols-3 gap-3 sm:gap-4"
        style={{
          animation: "fadeSlideIn 0.5s ease-out 0.3s both",
        }}
      >
        {[
          {
            value: user.matchCredits,
            label: "رصيد التوافقات",
            icon: Sparkles,
            gradient: "from-violet-500 to-purple-600",
            bgLight: "from-violet-50 to-purple-50",
            textColor: "text-violet-700",
            shadowColor: "shadow-violet-500/10",
          },
          {
            value: user._count.receivedSuggestions,
            label: "اقتراحات مستلمة",
            icon: Star,
            gradient: "from-amber-500 to-orange-500",
            bgLight: "from-amber-50 to-orange-50",
            textColor: "text-amber-700",
            shadowColor: "shadow-amber-500/10",
          },
          {
            value: totalMatches,
            label: "توافقات",
            icon: Heart,
            gradient: "from-rose-500 to-pink-500",
            bgLight: "from-rose-50 to-pink-50",
            textColor: "text-rose-700",
            shadowColor: "shadow-rose-500/10",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className={`group relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgLight} hover:shadow-lg ${stat.shadowColor} transition-all duration-300 hover:-translate-y-1`}
          >
            <CardContent className="pt-5 pb-4 px-4 text-center relative">
              {/* Decorative circle */}
              <div className="absolute -top-6 -left-6 h-16 w-16 rounded-full bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity" />

              <div
                className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <p className={`text-3xl font-extrabold ${stat.textColor} mb-0.5`}>
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
      <div
        style={{
          animation: "fadeSlideIn 0.5s ease-out 0.35s both",
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              href: "/dashboard/personality-quiz",
              icon: Brain,
              label: "اختبار الشخصية",
              desc: user.personalityResult
                ? `النتيجة: ${user.personalityResult.personalityType}`
                : "لم يُجرَ بعد",
              gradient: "from-pink-500 to-rose-600",
              hoverBorder: "hover:border-pink-300",
            },
            {
              href: "/dashboard/identity",
              icon: Shield,
              label: "التحقق من الهوية",
              desc: user.identityDoc?.status === "APPROVED" ? "تم التحقق" : "قيد المراجعة",
              gradient: "from-sky-500 to-blue-500",
              hoverBorder: "hover:border-sky-300",
            },
            {
              href: "/dashboard/photos",
              icon: Camera,
              label: "صوري الشخصية",
              desc: `${user.photos?.length ?? 0} صور مرفوعة`,
              gradient: "from-violet-500 to-purple-600",
              hoverBorder: "hover:border-violet-300",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card
                className={`group relative overflow-hidden border-border/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer ${item.hoverBorder}`}
              >
                {/* Subtle gradient overlay on hover */}
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
          className="relative overflow-hidden border-blue-200/60 bg-gradient-to-l from-blue-50/80 to-sky-50/50 shadow-sm"
          style={{ animation: "fadeSlideIn 0.5s ease-out both" }}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 border border-blue-200/60">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-blue-900 text-sm">
                  طلب تعديل قيد المراجعة
                </h3>
                <p className="text-xs text-blue-700/80 mt-0.5">
                  تم إرسال طلب تعديل الملف الشخصي. سيتم مراجعته من قبل الإدارة وإعلامك بالنتيجة.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================ */}
      {/*  Deactivate Account                          */}
      {/* ============================================ */}
      <div
        style={{
          animation: "fadeSlideIn 0.5s ease-out 0.4s both",
        }}
      >
        <Card className="relative overflow-hidden border-destructive/20 shadow-sm">
          {/* Subtle red gradient border top */}
          <div className="h-1 bg-gradient-to-l from-red-400 to-destructive" />
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-100 to-rose-100 flex items-center justify-center flex-shrink-0">
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
              <div className="mt-5 p-5 bg-gradient-to-l from-destructive/5 to-red-50/50 rounded-xl border border-destructive/20 space-y-4">
                {/* Backdrop blur modal feel */}
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    هل أنت متأكد من رغبتك في تعطيل حسابك؟
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم إخفاء ملفك الشخصي من جميع الاقتراحات والبحث. يمكنك
                  إعادة تفعيل حسابك في أي وقت عبر تسجيل الدخول مجدداً.
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
      <div style={{ animation: "fadeSlideIn 0.5s ease-out 0.5s both" }}>
        <Card className="relative overflow-hidden border-red-300/30 shadow-sm">
          <div className="h-1 bg-gradient-to-l from-red-600 to-red-400" />
          <CardContent className="p-5 md:p-6">
            {deletionRequest ? (
              /* Active deletion request — show countdown */
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-100 to-rose-100 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-700 text-base">حذف الحساب قيد التنفيذ</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف حسابك نهائياً في{" "}
                      <span className="font-bold text-red-600">
                        {new Date(deletionRequest.scheduledAt).toLocaleDateString("ar-JO", {
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
                  className="border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400 rounded-xl font-semibold"
                  disabled={deletionLoading}
                  onClick={async () => {
                    setDeletionLoading(true);
                    try {
                      const res = await fetch("/api/profile/delete", { method: "DELETE" });
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
              /* No deletion request — show delete button */
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-red-100 to-rose-100 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-700 text-base">حذف الحساب نهائياً</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      سيتم حذف جميع بياناتك نهائياً بعد 30 يوماً من تقديم الطلب. لا يمكن استعادة البيانات بعد الحذف.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-red-300/50 text-red-600 hover:bg-red-50 hover:border-red-400 shrink-0 rounded-xl font-semibold"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  حذف الحساب
                </Button>
              </div>
            )}

            {showDeleteConfirm && !deletionRequest && (
              <div className="mt-5 p-5 bg-gradient-to-l from-red-50/80 to-rose-50/50 rounded-xl border border-red-200/40 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <p className="text-sm font-bold text-red-700">
                    هل أنت متأكد من رغبتك في حذف حسابك نهائياً؟
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم تعطيل حسابك فوراً وحذفه نهائياً بعد 30 يوماً. يمكنك إلغاء الطلب خلال هذه الفترة.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">سبب الحذف (اختياري)</label>
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
                          body: JSON.stringify({ reason: deleteReason || undefined }),
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
