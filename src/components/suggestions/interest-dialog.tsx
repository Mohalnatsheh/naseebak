"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, HeartHandshake, Loader2, MessageCircle, Users } from "lucide-react";
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
import { CREDIT_ON_INTEREST_LINE } from "@/lib/suggestions/copy";
import { GuardianQuickForm } from "@/components/intro/guardian-quick-form";

export type IntroPreferenceChoice = "CHAT" | "FAMILY";


/** Recharge prompt when "مهتم" can't proceed (disabled button, API NO_CREDITS). */
export function rechargeToContinue(viewerFemale: boolean): string {
  return viewerFemale ? "اشحني رصيدك للمتابعة" : "اشحن رصيدك للمتابعة";
}

const CONSENT_LABEL = "أوافق على مشاركة اسم ورقم ولي الأمر";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The other person's gender; the viewer is the opposite one */
  partnerGender?: string;
  credits: number;
  chatEnabled: boolean;
  guardian: { exists: boolean; consented: boolean };
  /**
   * Older suggestions / interests still in flight have no introduction choice: only confirm the
   * credit, and `onConfirm` gets no preference.
   */
  costOnly?: boolean;
  onConfirm: (p?: { introPreference: IntroPreferenceChoice; guardianConsent?: boolean }) => Promise<void>;
}

/**
 * Credit on interest: "مهتم" on a shared suggestion asks how the introduction should start if the
 * interest is mutual — chat here first, or a family introduction straight away (needs guardian consent).
 */
export function InterestDialog({ open, onOpenChange, partnerGender, credits, chatEnabled, guardian: guardianProp, costOnly = false, onConfirm }: Props) {
  const [choice, setChoice] = useState<IntroPreferenceChoice | null>(null);
  // Added here through GuardianQuickForm (saved with consent) before the shared data catches up
  const [guardianSaved, setGuardianSaved] = useState(false);
  const guardian = guardianSaved ? { exists: true, consented: true } : guardianProp;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setChoice(null);
      setConsent(false);
      setGuardianSaved(false);
    }
  }, [open]);

  const viewerFemale = partnerGender === "MALE";
  const g = (masculine: string, feminine: string) => (viewerFemale ? feminine : masculine);
  const partnerFemale = !viewerFemale;

  const family = choice === "FAMILY";
  const missingGuardian = family && !guardian.exists;
  const needsConsent = family && guardian.exists && !guardian.consented;
  const noCredits = credits <= 0;
  const canConfirm = costOnly ? !busy : !busy && !!choice && !missingGuardian && (!needsConsent || consent);

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      if (costOnly) await onConfirm();
      else if (choice) await onConfirm({ introPreference: choice, ...(needsConsent && { guardianConsent: true }) });
    } finally {
      setBusy(false);
    }
  }

  const options: { value: IntroPreferenceChoice; icon: typeof Users; title: string; text: string }[] = [
    ...(chatEnabled
      ? [{
          value: "CHAT" as const,
          icon: MessageCircle,
          title: "محادثة هنا أولاً",
          text: "محادثة نصية داخل نصيبك لمدة 14 يوماً، وتنتقلان للتعارف العائلي متى شئتما.",
        }]
      : []),
    {
      value: "FAMILY",
      icon: Users,
      title: "تعارف عائلي مباشرة",
      text: "تتبادل العائلتان اسم وليّ الأمر ورقمه لترتيب الزيارة.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      {/* No auto-focus on the first option: its focus ring looked like a default choice */}
      <DialogContent dir="rtl" className="sm:max-w-md text-right" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="text-right sm:text-right">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15">
            <HeartHandshake className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          {costOnly ? (
            <>
              <DialogTitle className="text-lg">تأكيد «مهتم»</DialogTitle>
              <DialogDescription className="text-right leading-relaxed">
                عندما يكون الاهتمام متبادلاً يصبح توافقاً،
                {g(" وتختار طريقة التعارف من صفحة التوافقات.", " وتختارين طريقة التعارف من صفحة التوافقات.")}
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle className="text-lg">{g("كيف تحب أن يبدأ التعارف؟", "كيف تحبين أن يبدأ التعارف؟")}</DialogTitle>
              <DialogDescription className="text-right leading-relaxed">
                {partnerFemale ? "إذا أبدت اهتمامها أيضاً" : "إذا أبدى اهتمامه أيضاً"} يصبح توافقاً متبادلاً
                {g(" ويبدأ التعارف الذي تختاره مباشرة.", " ويبدأ التعارف الذي تختارينه مباشرة.")}
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {!costOnly && (
          <div role="radiogroup" aria-label="طريقة التعارف" className="space-y-2">
            {options.map((o) => {
              const selected = choice === o.value;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    selected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "border-border/60 hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name="intro-preference"
                    value={o.value}
                    checked={selected}
                    onChange={() => setChoice(o.value)}
                    aria-describedby={`intro-pref-${o.value}`}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      selected ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground" : "bg-gradient-to-br from-primary/15 to-accent/15 text-primary"
                    )}
                    aria-hidden="true"
                  >
                    <o.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{o.title}</span>
                    <span id={`intro-pref-${o.value}`} className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {o.text}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {missingGuardian && <GuardianQuickForm onSaved={() => setGuardianSaved(true)} />}

        {needsConsent && (
          <div className="rounded-xl border border-border/60 p-3 text-sm hover:bg-muted/40">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-describedby="intro-consent-note"
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
              />
              <span className="font-medium leading-relaxed text-foreground">{CONSENT_LABEL}</span>
            </label>
            <p id="intro-consent-note" className="ms-7 text-xs text-muted-foreground">
              مع عائلة الطرف الآخر فقط، عند التوافق المتبادل.
            </p>
          </div>
        )}

        {noCredits ? (
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-3 text-sm text-amber-800">
            <p className="font-semibold">رصيدك صفر</p>
            <p className="mt-1">{CREDIT_ON_INTEREST_LINE}</p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
            <Coins className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">مهتم يستخدم رصيداً واحداً — رصيدك {credits}</p>
              <p className="text-muted-foreground">
                {/* Older suggestions / received interests have no 7-day window, so no refund applies to them */}
                {costOnly
                  ? "لا يُسترجع الرصيد إن لم يكتمل التوافق. التوافق والطلبات والمحادثة بعده مجانية."
                  : "يعود الرصيد إذا انتهت مدة الاقتراح دون ردّ من الطرف الآخر. التوافق والطلبات والمحادثة بعده مجانية."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          {noCredits ? (
            <Button asChild className="flex-1 sm:flex-none">
              <Link href="/dashboard/payments">{rechargeToContinue(viewerFemale)}</Link>
            </Button>
          ) : (
            <Button onClick={confirm} disabled={!canConfirm} className="flex-1 sm:flex-none min-w-28">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              تأكيد «مهتم»
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
