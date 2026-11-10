"use client";

import { useState, type RefObject } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
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
import { returnFocusTo } from "@/lib/dialog-focus";
import type { FamilyStatus } from "@/lib/intro/requests";

const REASONS = [
  { value: "HARASSMENT", label: "إزعاج أو أسلوب غير لائق" },
  { value: "INAPPROPRIATE_CONTENT", label: "محتوى غير مناسب" },
  { value: "FAKE_PROFILE", label: "حساب غير حقيقي" },
  { value: "SPAM", label: "رسائل مزعجة أو احتيال" },
  { value: "OTHER", label: "سبب آخر" },
] as const;

export type ReportReasonValue = (typeof REASONS)[number]["value"];

/**
 * Ending the chat also closes the family path on this match (`endConversation` cancels a pending
 * family request), so say so while that path is still open.
 */
function familyPathWarning(familyStatus: FamilyStatus | undefined): string | null {
  if (familyStatus === "pending_sent" || familyStatus === "pending_received") {
    return "سيُلغى أيضاً طلب التعارف العائلي المعلّق، ولن يمكن طلب تعارف عائلي لهذا التوافق بعد ذلك.";
  }
  if (familyStatus === "none") {
    return "لن يمكن طلب تعارف عائلي لهذا التوافق بعد إنهاء المحادثة. إن كنتما تريدان التعارف العائلي فاطلباه قبل الإنهاء.";
  }
  return null;
}

/**
 * The report's two outcomes in words (the app's `reportSheetCopy`, owner ruling «إبلاغ فقط»): «إبلاغ فقط» files the
 * report and the chat goes on; the other choice says exactly what else happens. In an open chat it ends the chat,
 * blocks and closes the match; in a closed one (ended, expired, blocked) there is nothing to end: it reports and blocks.
 */
export function reportChoiceCopy({ open }: { open: boolean }) {
  const other = "الطرف الآخر";
  return {
    description: "يصل البلاغ إلى فريق نصيبك ويراجعه.",
    onlyConsequence: open ? "تبقى المحادثة مفتوحة، ولا يُحظر أحد." : "لا يتغير شيء آخر.",
    submitLabel: open ? "إبلاغ وإنهاء المحادثة" : "إبلاغ وحظر",
    submitConsequence: open
      ? `تنتهي المحادثة للطرفين ولا تُفتح مرة أخرى، ويُحظر ${other} ويُغلق التوافق.`
      : `يُحظر ${other} ويُغلق التوافق.`,
  };
}

/** The toast after a report or an end: never «تم إنهاء المحادثة» for a chat that was already closed (as the app) */
export function reportDoneText({ report, end, open }: { report: boolean; end: boolean; open: boolean }): string {
  if (!report) return "تم إنهاء المحادثة";
  if (!end) return "تم إرسال البلاغ، وسيراجعه فريق نصيبك.";
  return open ? "تم إنهاء المحادثة والإبلاغ" : "تم الإبلاغ والحظر";
}

/** End the chat; in report mode: «إبلاغ فقط», or report and end (which also blocks the other person). */
export function EndChatDialog({
  open,
  onOpenChange,
  report,
  partnerName,
  familyStatus,
  busy,
  onConfirm,
  ended = false,
  reportedMessage,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: boolean;
  partnerName: string;
  /** The match's family introduction status, when the intro requests switch is on */
  familyStatus?: FamilyStatus;
  busy: boolean;
  /** `end: false` = «إبلاغ فقط» */
  onConfirm: (report?: { reason: ReportReasonValue; details?: string; end: boolean }) => void;
  /** The chat is already closed (or blocked): nothing left to end */
  ended?: boolean;
  /** «إبلاغ عن الرسالة»: the reported message's one-line snippet, shown as a quote (the room sends its id) */
  reportedMessage?: string;
  /** Opened from a menu: where the focus goes back on close */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const [reason, setReason] = useState<ReportReasonValue>("HARASSMENT");
  const [details, setDetails] = useState("");
  // Start fresh each time the dialog opens (adjusting state while rendering, not in an effect)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("HARASSMENT");
      setDetails("");
    }
  }
  const familyWarning = report ? null : familyPathWarning(familyStatus);
  const copy = reportChoiceCopy({ open: !ended });
  const answer = (end: boolean) => ({ reason, details: details.trim() || undefined, end });

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir="rtl" className="sm:max-w-md text-right" onCloseAutoFocus={returnFocus ? returnFocusTo(returnFocus) : undefined}>
        <DialogHeader className="text-right sm:text-right">
          {report && (
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden />
            </div>
          )}
          <DialogTitle>{report ? (reportedMessage ? "إبلاغ عن الرسالة" : `الإبلاغ عن ${partnerName}`) : "إنهاء المحادثة"}</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {report ? copy.description : `ستُغلق المحادثة نهائياً للطرفين ولا يمكن فتحها مرة أخرى. سيبقى التوافق مع ${partnerName} ظاهراً.`}
          </DialogDescription>
        </DialogHeader>

        {familyWarning && (
          <p className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-3 text-sm leading-relaxed text-amber-800">
            {familyWarning}
          </p>
        )}

        {report && (
          <div className="space-y-3">
            {reportedMessage && (
              <div data-testid="reported-message" className="rounded-xl border-s-4 border-destructive/60 bg-muted/50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">الرسالة المُبلَّغ عنها</p>
                <p dir="auto" className="mt-0.5 break-words text-foreground">{reportedMessage}</p>
              </div>
            )}
            <div role="radiogroup" aria-label="سبب البلاغ" className="grid gap-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    reason === r.value ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[var(--primary)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              aria-label="تفاصيل إضافية (اختياري)"
              placeholder="تفاصيل إضافية (اختياري)"
              className="min-h-20 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        )}

        {report ? (
          // Two outcomes, each with what it does (owner ruling): «إبلاغ فقط» first
          <div className="grid gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onConfirm(answer(false))} aria-label="إبلاغ فقط" aria-describedby="report-only-what" className="h-auto min-h-11 flex-col items-stretch gap-0.5 py-2 text-start">
              <span className="font-bold">إبلاغ فقط</span>
              <span id="report-only-what" className="text-xs font-normal whitespace-normal text-muted-foreground">
                {copy.onlyConsequence}
              </span>
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => onConfirm(answer(true))} aria-label={copy.submitLabel} aria-describedby="report-end-what" className="h-auto min-h-11 flex-col items-stretch gap-0.5 py-2 text-start">
              <span className="flex items-center gap-1.5 font-bold">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {copy.submitLabel}
              </span>
              <span id="report-end-what" className="text-xs font-normal whitespace-normal text-destructive-foreground/90">
                {copy.submitConsequence}
              </span>
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="min-h-11">
              إلغاء
            </Button>
          </div>
        ) : (
          <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
            <Button variant="destructive" disabled={busy} onClick={() => onConfirm(undefined)} className="min-h-11 flex-1 sm:flex-none">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              إنهاء المحادثة
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="min-h-11 flex-1 sm:flex-none">
              إلغاء
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
