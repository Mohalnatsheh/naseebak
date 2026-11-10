"use client";

import { useState, useEffect } from "react";
import {
  Gift,
  Copy,
  Share2,
  Users,
  CreditCard,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/dashboard-context";
import { formatDate } from "@/lib/countries";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-loading";
import { MemberAvatar } from "@/components/shared/member-avatar";

interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  completedReferrals: number;
  referrals: {
    id: string;
    creditsAwarded: boolean;
    awardedAt: string | null;
    createdAt: string;
    referee: { firstName: string; createdAt: string };
  }[];
}

/** Same cap as MAX_REWARDED_REFERRALS in src/lib/referral.ts (that module imports the db) */
const MAX_REWARDED_REFERRALS = 10;

export default function ReferralPage() {
  // New cycle: the reward is paid once the friend finishes the short setup; legacy: 100% profile
  const { counts: { flags }, country, profile } = useDashboardData();
  const female = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);
  const newCycle = flags.introRequests;
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/referral");
        // An error body (401/500) has no referral fields: treat it as a failed load, never render it
        if (!res.ok) throw new Error(`referral ${res.status}`);
        const json = await res.json();
        setData(Array.isArray(json?.referrals) ? json : null);
      } catch (err) {
        console.error("Failed to fetch referral data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [reloadKey]);

  async function handleCopy() {
    if (!data) return;
    const url = `https://naseebak.com/register?invitationCode=${data.referralCode}`;
    const text = `يمكنك التسجيل في نصيبك والحصول على رصيد مجاني!\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleShare() {
    if (!data) return;
    const url = `https://naseebak.com/register?invitationCode=${data.referralCode}`;
    const text = `يمكنك التسجيل في نصيبك والحصول على رصيد مجاني!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "دعوة لمنصة نصيبك", text, url });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  }

  if (loading) {
    return <PageLoading width="max-w-2xl" />;
  }

  if (!data) {
    return (
      <div className="py-8">
        <LoadError
          message="تعذّر تحميل بيانات الدعوة. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <PageHeader
        icon={Gift}
        title={g("ادعُ صديقاً", "ادعي صديقة")}
        description={
          newCycle
            ? g("شارك رمز الدعوة مع أصدقائك ليسجّلوا في نصيبك، وستحصل على رصيد مجاني عن كل صديق يُنهي إعداد ملفه", "شاركي رمز الدعوة مع صديقاتك ليسجّلن في نصيبك، وستحصلين على رصيد مجاني عن كل صديقة تُنهي إعداد ملفها")
            : g("شارك رمز الدعوة مع أصدقائك ليسجّلوا في نصيبك، وستحصل على رصيد مجاني عن كل صديق يُكمل ملفه الشخصي", "شاركي رمز الدعوة مع صديقاتك ليسجّلن في نصيبك، وستحصلين على رصيد مجاني عن كل صديقة تُكمل ملفها الشخصي")
        }
      />

      {/* Referral Code Card */}
      <Card className="overflow-hidden border-primary/10">
        <div className="h-1.5 bg-gradient-to-l from-accent via-primary to-accent/60" />
        <CardContent className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">رمز الدعوة الخاص بك</p>
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-l from-primary/10 to-accent/10 border border-primary/20">
              <span className="text-2xl font-bold tracking-[0.15em] text-foreground font-mono">
                {data.referralCode}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleCopy}
              variant="outline"
              className="flex-1 h-11 rounded-xl border-primary/20 hover:bg-primary/5"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 me-2 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 me-2" />
              )}
              {copied ? "تم النسخ!" : "نسخ الرمز"}
            </Button>
            <Button
              onClick={handleShare}
              className="flex-1 h-11 rounded-xl bg-gradient-to-l from-primary to-secondary text-white shadow-lg shadow-primary/20"
            >
              <Share2 className="h-4 w-4 me-2" />
              مشاركة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rewards Explanation */}
      <Card className="overflow-hidden border-accent/10">
        <div className="h-1 bg-gradient-to-l from-accent to-accent/60" />
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-accent-foreground" />
            </div>
            <h2 className="font-bold text-foreground">المكافآت والرصيد</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10 p-4 text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary">+2</p>
              <p className="text-xs text-muted-foreground">{g("رصيد لك (صاحب الدعوة)", "رصيد لكِ (صاحبة الدعوة)")}</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/10 p-4 text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <CreditCard className="h-5 w-5 text-accent-foreground" />
              </div>
              <p className="text-2xl font-bold text-accent-foreground">+1</p>
              <p className="text-xs text-muted-foreground">{g("رصيد لصديقك (المدعو)", "رصيد لصديقتك (المدعوة)")}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {newCycle
              ? g("تحصلان على الرصيد عندما يُنهي صديقك إعداد ملفه الشخصي", "تحصلان على الرصيد عندما تُنهي صديقتك إعداد ملفها الشخصي")
              : g("تحصلان على الرصيد عندما يُكمل صديقك ملفه الشخصي بنسبة 100%", "تحصلان على الرصيد عندما تُكمل صديقتك ملفها الشخصي بنسبة 100%")}
            {g(` (رصيد الداعي لأول ${MAX_REWARDED_REFERRALS} أصدقاء)`, ` (رصيد الداعية لأول ${MAX_REWARDED_REFERRALS} صديقات)`)}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 text-center space-y-1">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{data.totalReferrals}</p>
            <p className="text-xs text-muted-foreground">إجمالي الدعوات</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 text-center space-y-1">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">{data.completedReferrals}</p>
            <p className="text-xs text-muted-foreground">دعوات مكتملة</p>
          </CardContent>
        </Card>
      </div>

      {/* Referral List */}
      {data.referrals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">
            سجل الدعوات
          </h2>
          <div className="space-y-2">
            {data.referrals.map((referral) => (
              <Card key={referral.id} className="border-border/50">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={referral.referee.firstName} size={36} dimmed={!referral.creditsAwarded} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {referral.referee.firstName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(referral.createdAt, country, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-semibold ${
                    referral.creditsAwarded
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}>
                    {referral.creditsAwarded ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        تم منح الرصيد
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3" />
                        {newCycle ? "بانتظار إنهاء الإعداد" : "بانتظار اكتمال الملف"}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.referrals.length === 0 && (
        <div className="text-center py-8 space-y-3">
          <div className="h-16 w-16 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
            <Users className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            {g("لم تدعُ أحداً بعد. شارك رمزك مع أصدقائك!", "لم تدعي أحداً بعد. شاركي رمزك مع صديقاتك!")}
          </p>
        </div>
      )}
    </div>
  );
}
