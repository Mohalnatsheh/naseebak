"use client";

import { useState, useEffect } from "react";
import {
  Gift,
  Copy,
  Share2,
  Loader2,
  Users,
  CreditCard,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/dashboard-context";
import { LoadError } from "@/components/shared/load-error";

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
  const { counts: { flags } } = useDashboardData();
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
    const text = `سجّل في نصيبك واحصل على رصيد مجاني!\n${url}`;
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
    const text = `سجّل في نصيبك واحصل على رصيد مجاني!`;

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
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-secondary/30 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <div className="absolute inset-0 h-16 w-16 rounded-full bg-primary/10 animate-ping" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">جارٍ التحميل...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <LoadError
          message="تعذّر تحميل بيانات الدعوة. تحقّق من الاتصال وحاول مرة أخرى."
          onRetry={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-accent/10 via-primary/5 to-transparent border border-primary/10 p-4 sm:p-6 md:p-8">
        <div className="absolute top-0 left-0 w-40 h-40 bg-accent/10 rounded-full -translate-x-16 -translate-y-16 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-full translate-x-8 translate-y-8 blur-2xl" />

        <div className="relative space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center shadow-lg shadow-accent/20">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
              ادعُ صديقاً
            </h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            {newCycle
              ? "شارك رمز الدعوة مع أصدقائك ليسجّلوا في نصيبك، وستحصل على رصيد مجاني عن كل صديق يُنهي إعداد ملفه"
              : "شارك رمز الدعوة مع أصدقائك ليسجّلوا في نصيبك، وستحصل على رصيد مجاني عن كل صديق يُكمل ملفه الشخصي"}
          </p>
        </div>
      </div>

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
              {copied ? "تم النسخ!" : "انسخ الرمز"}
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
            <h3 className="font-bold text-foreground">المكافآت والرصيد</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10 p-4 text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <p className="text-2xl font-bold text-primary">+2</p>
              <p className="text-xs text-muted-foreground">رصيد لك (الداعي)</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/10 p-4 text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <CreditCard className="h-5 w-5 text-accent-foreground" />
              </div>
              <p className="text-2xl font-bold text-accent-foreground">+1</p>
              <p className="text-xs text-muted-foreground">رصيد لصديقك (المدعو)</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {newCycle
              ? "تحصلان على الرصيد عندما يُنهي صديقك إعداد ملفه الشخصي"
              : "تحصلان على الرصيد عندما يُكمل صديقك ملفه الشخصي بنسبة 100%"}
            {` (رصيد الداعي لأول ${MAX_REWARDED_REFERRALS} أصدقاء)`}
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
          <h3 className="text-sm font-semibold text-muted-foreground px-1">
            سجل الدعوات
          </h3>
          <div className="space-y-2">
            {data.referrals.map((referral) => (
              <Card key={referral.id} className="border-border/50">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      referral.creditsAwarded
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {referral.referee.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {referral.referee.firstName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(referral.createdAt).toLocaleDateString("ar-JO-u-nu-latn", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
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
            لم تدعُ أحداً بعد. شارك رمزك مع أصدقائك!
          </p>
        </div>
      )}
    </div>
  );
}
