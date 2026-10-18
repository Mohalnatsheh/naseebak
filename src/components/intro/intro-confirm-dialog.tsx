"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users, MessageCircle, Coins, Gift, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { GuardianQuickForm } from "./guardian-quick-form";

export type IntroDialogMode = "send" | "accept" | "decline";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: IntroDialogMode;
  type: "FAMILY" | "CHAT";
  partnerName: string;
  credits: number;
  /** Family request after a chat costs nothing (and every request with credit on interest) */
  free?: boolean;
  /** Why it is free; defaults to the chat → family wording */
  freeNote?: string;
  guardian: { exists: boolean; consented: boolean };
  busy: boolean;
  onConfirm: (consent: boolean) => void;
}

const POINTS: Record<"FAMILY" | "CHAT", string[]> = {
  FAMILY: [
    "عند القبول تظهر لكل طرف بيانات وليّ أمر الطرف الآخر: الاسم وصلة القرابة ورقم الهاتف.",
    "تتواصل العائلتان مباشرة لترتيب موعد الزيارة.",
  ],
  CHAT: [
    "محادثة نصية خاصة داخل نصيبك لمدة 14 يوماً.",
    "لا يُسمح بمشاركة أرقام الهواتف أو الروابط أو حسابات التواصل.",
    "يمكنكما الانتقال لتعارف عائلي في أي وقت.",
  ],
};

const CONSENT_TEXT =
  "أوافق على مشاركة اسم ورقم وليّ الأمر مع عائلة الطرف الآخر فقط بعد قبول طلب التعارف العائلي.";

export function IntroConfirmDialog({
  open,
  onOpenChange,
  mode,
  type,
  partnerName,
  credits,
  free,
  freeNote,
  guardian: guardianProp,
  busy,
  onConfirm,
}: Props) {
  const [consent, setConsent] = useState(false);
  // Added here through GuardianQuickForm (saved with consent) before the caller's state catches up
  const [guardianSaved, setGuardianSaved] = useState(false);
  const guardian = guardianSaved ? { exists: true, consented: true } : guardianProp;
  // The partner is the opposite gender of the viewer
  const partnerFemale = useDashboardData().profile?.gender === "MALE";
  useEffect(() => {
    if (open) {
      setConsent(false);
      setGuardianSaved(false);
    }
  }, [open]);

  const isFamily = type === "FAMILY";
  const needsGuardianStep = isFamily && mode !== "decline";
  const missingGuardian = needsGuardianStep && !guardian.exists;
  const needsConsent = needsGuardianStep && guardian.exists && !guardian.consented;
  const noCredits = mode === "send" && !free && credits <= 0;
  const canConfirm = !busy && !missingGuardian && !noCredits && (!needsConsent || consent);

  const Icon = isFamily ? Users : MessageCircle;
  const title =
    mode === "send"
      ? isFamily ? `طلب تعارف عائلي مع ${partnerName}` : `طلب محادثة مع ${partnerName}`
      : mode === "accept"
        ? isFamily ? "قبول طلب التعارف العائلي" : "قبول طلب المحادثة"
        : "الاعتذار عن الطلب";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir="rtl" className="sm:max-w-md text-right">
        <DialogHeader className="text-right sm:text-right">
          <div
            className={cn(
              "mb-2 flex h-12 w-12 items-center justify-center rounded-2xl",
              mode === "decline" ? "bg-muted" : "bg-gradient-to-br from-primary/15 to-accent/15"
            )}
          >
            <Icon className={cn("h-6 w-6", mode === "decline" ? "text-muted-foreground" : "text-primary")} />
          </div>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {mode === "decline"
              ? `سيتم إبلاغ ${partnerName} بلطف أن الطلب لم يُقبل حالياً، ولن يكون بالإمكان إرسال هذا النوع من الطلبات مرة أخرى لهذا التوافق.`
              : mode === "accept"
                ? isFamily
                  ? `بعد القبول ستظهر بيانات وليّ أمرك لعائلة ${partnerName}، وتظهر لك بيانات ${partnerFemale ? "وليّ أمرها" : "وليّ أمره"}.`
                  : `بعد القبول تُفتح محادثة نصية بينك وبين ${partnerName} لمدة 14 يوماً.`
                : "راجع التفاصيل قبل الإرسال."}
          </DialogDescription>
        </DialogHeader>

        {mode === "send" && (
          <ul className="space-y-2">
            {POINTS[type].map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        {mode === "send" &&
          (free ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
              <Gift className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{freeNote ?? "مجاناً — لأنكما تتعارفان عبر المحادثة."}</p>
            </div>
          ) : noCredits ? (
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-3 text-sm text-amber-800">
              <p className="font-semibold">رصيدك صفر</p>
              <p className="mt-1">اشحن رصيدك لإرسال هذا الطلب.</p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
              <Coins className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-foreground" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  سيتم خصم رصيد واحد · رصيدك الحالي {credits}
                </p>
                <p className="text-muted-foreground">
                  لا يُسترجع الرصيد في حال عدم القبول أو انتهاء مدة الطلب (7 أيام).
                </p>
              </div>
            </div>
          ))}

        {missingGuardian && <GuardianQuickForm onSaved={() => setGuardianSaved(true)} />}

        {needsConsent && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 text-sm hover:bg-muted/40">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
            />
            <span className="leading-relaxed text-foreground/80">{CONSENT_TEXT}</span>
          </label>
        )}

        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          {noCredits ? (
            <Button asChild className="flex-1 sm:flex-none">
              <Link href="/dashboard/payments">اشحن رصيدك</Link>
            </Button>
          ) : (
            <Button
              onClick={() => onConfirm(consent)}
              disabled={!canConfirm}
              variant={mode === "decline" ? "outline" : "default"}
              className="flex-1 sm:flex-none min-w-28"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "send" ? "إرسال الطلب" : mode === "accept" ? "قبول" : "تأكيد الاعتذار"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="flex-1 sm:flex-none">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
