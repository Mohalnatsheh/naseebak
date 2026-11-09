"use client";

import Link from "next/link";
import { BellOff, BellRing, CheckCircle2, ChevronLeft, Clock, Hourglass, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { forViewer } from "@/lib/gendered-copy";
import { openPushSetup } from "@/components/shared/notification-bar";
import { daysLabel } from "@/components/intro/intro-utils";
import type { ChatBar, FamilyStep } from "./chat-look";

type Tone = "brand" | "warning" | "success";

/** The one slim line under the chat header: an icon, one line, at most one action (or ✕ for the push chip) */
function Strip({
  icon: Icon,
  tone = "brand",
  testId,
  children,
  action,
  href,
  onClose,
}: {
  icon: typeof Clock;
  tone?: Tone;
  testId: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  href?: string;
  onClose?: () => void;
}) {
  const toneText = tone === "warning" ? "text-amber-800" : tone === "success" ? "text-emerald-700" : "text-primary";
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {href && <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  return (
    <div
      role="region"
      aria-label="تنبيه المحادثة"
      data-testid={testId}
      className={cn(
        "flex min-h-11 items-center gap-2 border-b border-border/50 px-3 text-[13.5px] font-semibold",
        tone === "warning" ? "bg-amber-50" : "bg-accent/10",
        toneText
      )}
    >
      {href ? (
        <Link href={href} className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
          {body}
        </Link>
      ) : (
        body
      )}
      {action && (
        <Button size="xs" variant="ghost" onClick={action.onClick} disabled={action.disabled} className="shrink-0 font-bold text-primary">
          {action.label}
        </Button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="إخفاء"
          className="-me-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * The bar chosen by `chatStatusBar()`: ending soon (with «تمديد 7 أيام» while it can be extended), the family step,
 * or the push chip. Replaces the stacked bars that took about 42% of a phone screen (QA WC-07).
 */
export function ChatStatusBar({
  bar,
  daysLeft,
  canExtend,
  busy,
  onExtend,
  family,
  onFamily,
  matchHref,
  viewerGender,
  pushBlocked,
  onPushDismiss,
}: {
  bar: ChatBar;
  daysLeft: number;
  canExtend: boolean;
  busy: boolean;
  onExtend: () => void;
  family: FamilyStep | null;
  onFamily: () => void;
  matchHref: string;
  viewerGender?: string;
  pushBlocked: boolean;
  onPushDismiss: () => void;
}) {
  const g = (m: string, f: string) => forViewer(viewerGender, m, f);
  if (bar === "expiry") {
    return (
      <Strip
        icon={Clock}
        tone="warning"
        testId="chat-bar-expiry"
        action={canExtend ? { label: "تمديد 7 أيام", onClick: onExtend, disabled: busy } : undefined}
      >
        تنتهي المحادثة قريباً · متبقي {daysLabel(daysLeft)}
      </Strip>
    );
  }
  if (bar === "family" && family) {
    if (family === "offer") {
      return (
        <Strip icon={Users} testId="chat-bar-family" action={{ label: "تعارف عائلي", onClick: onFamily }}>
          جاهزان للخطوة التالية؟
        </Strip>
      );
    }
    if (family === "pending_sent") {
      return (
        <Strip icon={Hourglass} tone="warning" testId="chat-bar-family">
          طلب التعارف العائلي بانتظار الرد
        </Strip>
      );
    }
    if (family === "pending_received") {
      return (
        <Strip icon={Users} testId="chat-bar-family" href={matchHref}>
          {g("وصلك طلب تعارف عائلي", "وصلكِ طلب تعارف عائلي")}
        </Strip>
      );
    }
    return (
      <Strip icon={CheckCircle2} tone="success" testId="chat-bar-family" href={matchHref}>
        بيانات وليّ الأمر
      </Strip>
    );
  }
  if (bar === "push") {
    return (
      <Strip
        icon={pushBlocked ? BellOff : BellRing}
        testId="chat-bar-push"
        action={{ label: pushBlocked ? "طريقة الفتح" : "تفعيل", onClick: openPushSetup }}
        onClose={onPushDismiss}
      >
        {pushBlocked
          ? "الإشعارات مغلقة على هذا الجهاز"
          : g("فعّل الإشعارات لتصلك الرسائل", "فعّلي الإشعارات لتصلكِ الرسائل")}
      </Strip>
    );
  }
  return null;
}
