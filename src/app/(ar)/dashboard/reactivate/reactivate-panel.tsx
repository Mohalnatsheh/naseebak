"use client";

import { useState } from "react";
import Image from "next/image";
import { signOutAndUnlinkPush } from "@/lib/push-client";
import { toast } from "sonner";
import { CalendarClock, Loader2, LogOut, PauseCircle, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  firstName: string;
  isFemale: boolean;
  /** ISO date of the scheduled permanent deletion, or null when the account is only paused */
  deletionScheduledAt: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-JO-u-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function ReactivatePanel({ firstName, isFemale, deletionScheduledAt }: Props) {
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const deleting = !!deletionScheduledAt;
  const remaining = deletionScheduledAt ? daysLeft(deletionScheduledAt) : 0;

  async function reactivate() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/reactivate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "تعذّرت إعادة تفعيل الحساب. حاول مرة أخرى.");
        setLoading(false);
        return;
      }
      toast.success("تم إعادة تفعيل حسابك");
      // Full reload so the dashboard layout re-reads the account state
      window.location.href = "/dashboard";
    } catch {
      toast.error("حدث خطأ في الاتصال. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
      <Image src="/images/logo.svg" alt="نصيبك" width={110} height={48} className="mb-8 h-10 w-auto" priority />

      <Card className="relative w-full overflow-hidden border-border/60 shadow-lg">
        <div
          className={
            deleting
              ? "h-1.5 bg-gradient-to-l from-destructive to-destructive/60"
              : "h-1.5 bg-gradient-to-l from-primary to-secondary"
          }
        />
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className={
                deleting
                  ? "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5"
                  : "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10"
              }
            >
              {deleting ? (
                <Trash2 className="h-8 w-8 text-destructive" />
              ) : (
                <PauseCircle className="h-8 w-8 text-primary" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {isFemale ? `أهلاً بعودتكِ يا ${firstName}` : `أهلاً بعودتك يا ${firstName}`}
              </p>
              <h1 className="text-2xl font-bold text-foreground">
                {deleting ? (isFemale ? "طلبتِ حذف حسابكِ" : "طلبتَ حذف حسابك") : "حسابك متوقف مؤقتاً"}
              </h1>
            </div>
          </div>

          {deleting && deletionScheduledAt ? (
            <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <p className="text-sm leading-relaxed text-foreground">
                  سيُحذف حسابك نهائياً بتاريخ{" "}
                  <span className="font-bold text-destructive">{formatDate(deletionScheduledAt)}</span>
                  {remaining > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({remaining === 1 ? "بعد يوم واحد" : remaining === 2 ? "بعد يومين" : `بعد ${remaining} ${remaining <= 10 ? "أيام" : "يوماً"}`})
                    </span>
                  )}
                  .
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isFemale
                  ? "حتى ذلك الموعد يمكنكِ إلغاء الطلب واستعادة حسابكِ كما هو، ببياناتكِ وتوافقاتكِ. بعد الحذف لا يمكن استعادة أي بيانات."
                  : "حتى ذلك الموعد يمكنك إلغاء الطلب واستعادة حسابك كما هو، ببياناتك وتوافقاتك. بعد الحذف لا يمكن استعادة أي بيانات."}
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-4">
              <p className="text-sm leading-relaxed text-foreground">
                {isFemale
                  ? "ملفكِ مخفي حالياً ولن تظهري في الاقتراحات ولن تصلكِ اقتراحات جديدة."
                  : "ملفك مخفي حالياً ولن تظهر في الاقتراحات ولن تصلك اقتراحات جديدة."}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isFemale
                  ? "أعيدي تفعيل حسابكِ لتعودي إلى لوحة التحكم وتتابعي رحلتكِ من حيث توقفتِ."
                  : "أعد تفعيل حسابك لتعود إلى لوحة التحكم وتتابع رحلتك من حيث توقفت."}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              disabled={loading || signingOut}
              onClick={reactivate}
              className="h-12 rounded-xl bg-gradient-to-l from-primary to-secondary text-base font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:scale-[1.01] hover:opacity-95 active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="me-2 h-5 w-5" />
                  {deleting ? "إلغاء طلب الحذف وإعادة التفعيل" : "إعادة تفعيل حسابي"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={loading || signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOutAndUnlinkPush("/login");
              }}
              className="h-12 rounded-xl font-semibold"
            >
              {signingOut ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <LogOut className="me-2 h-5 w-5" />
                  تسجيل الخروج
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border/50 pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-accent" />
            {deleting
              ? isFemale
                ? "يبقى حسابكِ مخفياً عن الجميع حتى تلغي الطلب أو يحين موعد الحذف."
                : "يبقى حسابك مخفياً عن الجميع حتى تلغي الطلب أو يحين موعد الحذف."
              : isFemale
                ? "يبقى حسابكِ مخفياً عن الجميع حتى تعيدي تفعيله."
                : "يبقى حسابك مخفياً عن الجميع حتى تعيد تفعيله."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
