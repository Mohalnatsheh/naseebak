"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bell, Heart, User, Camera, Brain, Coins, Ban, LifeBuoy, Gift, Settings, LogOut, ChevronLeft,
  ShieldCheck, Smartphone, Loader2, PenLine, MapPin, Crown,
} from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { countryConfig } from "@/lib/countries";
import { signOutAndUnlinkPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { matchesHref } from "@/lib/matches/links";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import { LoadError } from "@/components/shared/load-error";

interface Row {
  href: string;
  label: string;
  icon: typeof Bell;
  /** Small value on the left end (e.g. the balance) */
  value?: string;
  /** Red count (things waiting) */
  badge?: number;
}

function ageFrom(dob: unknown): number | null {
  if (typeof dob !== "string" && !(dob instanceof Date)) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * «حسابي» (phones open it from the bottom bar; replaces the slide-out menu): who I am at the top,
 * then every account page in short groups, and sign-out last. Same links as the desktop sidebar.
 */
export default function AccountPage() {
  const { profile, completeness, counts, unreadCount, loading, country, refreshProfile } = useDashboardData();
  const [signingOut, setSigningOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);

  const signOutButton = (
    <button
      type="button"
      disabled={signingOut}
      onClick={() => {
        setSigningOut(true);
        void signOutAndUnlinkPush("/login");
      }}
      className={cn(
        "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10",
        signingOut && "opacity-60"
      )}
    >
      {signingOut ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
      تسجيل الخروج
    </button>
  );

  // Same width as the loaded page, so nothing jumps when it fills in (QA WA-06)
  if (loading) {
    return (
      <div className="mx-auto flex max-w-xl justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  // The profile didn't load (QA WA-04): say so with a retry, and keep sign-out reachable
  if (!profile) {
    return (
      <div className="mx-auto max-w-xl space-y-5 py-6">
        <LoadError
          message="تعذّر تحميل حسابك. تحقّق من الاتصال وحاول مرة أخرى."
          onRetry={
            retrying
              ? undefined
              : () => {
                  setRetrying(true);
                  refreshProfile().finally(() => setRetrying(false));
                }
          }
        />
        {signOutButton}
      </div>
    );
  }

  const photo = profile.photos?.find((p) => p.isPrimary)?.url ?? profile.photos?.[0]?.url ?? null;
  const details = profile.profile ?? {};
  const age = ageFrom(details.dateOfBirth);
  const city = typeof details.city === "string" ? details.city : null;
  const completion = completeness?.total ?? 0;
  const credits = counts.credits ?? profile.matchCredits ?? 0;
  const creditsLabel = counts.flags.introRequests ? "رصيدك" : "رصيد الاقتراحات";

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "نشاطي",
      rows: [
        { href: "/dashboard/notifications", label: "الإشعارات", icon: Bell, badge: unreadCount },
        { href: matchesHref(counts.flags.mutualSuggestions), label: "توافقاتي المتبادلة", icon: Heart, badge: counts.pendingIntros },
      ],
    },
    {
      title: "ملفي",
      rows: [
        { href: "/dashboard/profile", label: "الملف الشخصي", icon: User },
        { href: "/dashboard/photos", label: "صوري", icon: Camera },
        { href: "/dashboard/personality-quiz", label: "اختبار الشخصية", icon: Brain, value: profile.personalityResult ? "مكتمل" : undefined },
        ...(counts.flags.mutualSuggestions
          ? [{ href: "/dashboard/suggestions#dealbreakers", label: "شروطي الأساسية", icon: ShieldCheck }]
          : []),
      ],
    },
    {
      title: "الرصيد",
      rows: [
        { href: "/dashboard/payments", label: creditsLabel, icon: Coins, value: String(credits) },
        // Only when there are plans to buy or a subscription to manage (same rule as the sidebar)
        ...(counts.pro?.showPage
          ? [{ href: PRO_PAGE_PATH, label: "عضوية Pro", icon: Crown, value: counts.pro.isPro ? "فعّالة" : undefined }]
          : []),
      ],
    },
    {
      title: "التطبيق والمساعدة",
      rows: [
        { href: "/dashboard/install", label: `التطبيق والإشعارات على ${countryConfig(country).words.phone}ك`, icon: Smartphone },
        { href: "/dashboard/support", label: "الدعم والملاحظات", icon: LifeBuoy },
        { href: "/dashboard/referral", label: g("ادعُ صديقاً", "ادعي صديقة"), icon: Gift },
      ],
    },
    {
      title: "الخصوصية والحساب",
      rows: [
        { href: "/dashboard/blocks", label: "المحظورون", icon: Ban },
        // Pause / delete live at the bottom of the profile page
        { href: "/dashboard/profile#account-settings", label: "إعدادات الحساب", icon: Settings },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-6">
      {/* Who I am */}
      <section className="landing-night relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-lg shadow-primary/15">
        <div className="landing-khatam absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            {photo ? (
              <Image
                src={photo}
                alt={g("صورتك الشخصية", "صورتكِ الشخصية")}
                fill
                sizes="80px"
                className="rounded-full object-cover ring-4 ring-accent/70"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-3xl font-extrabold ring-4 ring-white/20" aria-hidden>
                {profile.firstName?.charAt(0) || "؟"}
              </span>
            )}
            <Link
              href="/dashboard/photos"
              aria-label={photo ? "إدارة صوري" : g("أضف صورة", "أضيفي صورة")}
              className="absolute -bottom-2 -start-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md"
            >
              <Camera className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl leading-tight">
              {profile.firstName} {profile.lastName}
            </h1>
            {(age || city) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
                {city && <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{[age ? `${age} سنة` : null, city].filter(Boolean).join(" · ")}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-white/55" dir="ltr" style={{ textAlign: "right" }}>
              +{profile.phone}
            </p>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2.5">
          <Link href="/dashboard/profile" className="rounded-2xl bg-white/10 p-3 transition-colors hover:bg-white/15">
            <span className="text-xs text-white/65">اكتمال الملف</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="font-display text-xl text-accent">{completion}%</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${completion}%` }} />
              </span>
            </span>
          </Link>
          <Link href="/dashboard/payments" className="rounded-2xl bg-white/10 p-3 transition-colors hover:bg-white/15">
            <span className="text-xs text-white/65">{creditsLabel}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-accent" aria-hidden />
              <span className="font-display text-xl text-accent">{credits}</span>
              <span className="ms-auto text-xs font-semibold text-white/80">{g("اشحن", "اشحني")}</span>
            </span>
          </Link>
        </div>

        <Link
          href="/dashboard/profile/edit"
          className="relative mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-primary transition hover:bg-white/90"
        >
          <PenLine className="h-4 w-4" aria-hidden /> {g("تعديل ملفي", "تعديل ملفي")}
        </Link>
      </section>

      {/* Every account page, in short groups */}
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`grp-${group.title}`}>
          <h2 id={`grp-${group.title}`} className="mb-2 px-1 text-xs font-bold text-muted-foreground">
            {group.title}
          </h2>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
            {group.rows.map((row) => (
              <li key={row.href}>
                <Link href={row.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <row.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold text-foreground">{row.label}</span>
                  {row.badge && row.badge > 0 ? (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-white" aria-label={`${row.badge} جديد`}>
                      {row.badge > 99 ? "99+" : row.badge}
                    </span>
                  ) : row.value ? (
                    <span className="text-sm font-semibold text-muted-foreground">{row.value}</span>
                  ) : null}
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {signOutButton}
    </div>
  );
}
