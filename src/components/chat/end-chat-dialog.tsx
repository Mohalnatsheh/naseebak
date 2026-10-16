"use client";

import { useEffect, useState } from "react";
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

const REASONS = [
  { value: "HARASSMENT", label: "إزعاج أو أسلوب غير لائق" },
  { value: "INAPPROPRIATE_CONTENT", label: "محتوى غير مناسب" },
  { value: "FAKE_PROFILE", label: "حساب غير حقيقي" },
  { value: "SPAM", label: "رسائل مزعجة أو احتيال" },
  { value: "OTHER", label: "سبب آخر" },
] as const;

export type ReportReasonValue = (typeof REASONS)[number]["value"];

/** End the chat; in report mode it also reports and blocks the other person. */
export function EndChatDialog({
  open,
  onOpenChange,
  report,
  partnerName,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: boolean;
  partnerName: string;
  busy: boolean;
  onConfirm: (report?: { reason: ReportReasonValue; details?: string }) => void;
}) {
  const [reason, setReason] = useState<ReportReasonValue>("HARASSMENT");
  const [details, setDetails] = useState("");
  useEffect(() => {
    if (open) {
      setReason("HARASSMENT");
      setDetails("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir="rtl" className="sm:max-w-md text-right">
        <DialogHeader className="text-right sm:text-right">
          {report && (
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
          )}
          <DialogTitle>{report ? `إنهاء المحادثة والإبلاغ عن ${partnerName}` : "إنهاء المحادثة"}</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {report
              ? "ستُغلق المحادثة نهائياً ويتم حظر الطرف الآخر، ويراجع فريق نصيبك البلاغ."
              : `ستُغلق المحادثة نهائياً للطرفين ولا يمكن فتحها مرة أخرى. سيبقى التوافق مع ${partnerName} ظاهراً.`}
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="space-y-3">
            <div className="grid gap-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
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
              placeholder="تفاصيل إضافية (اختياري)"
              className="min-h-20 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onConfirm(report ? { reason, details: details.trim() || undefined } : undefined)}
            className="flex-1 sm:flex-none"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {report ? "إنهاء وإبلاغ" : "إنهاء المحادثة"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
