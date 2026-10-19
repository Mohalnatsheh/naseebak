"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import {
  BellRing,
  Check,
  ChevronLeft,
  ExternalLink,
  MoreHorizontal,
  MoreVertical,
  RotateCw,
  Share,
  SquarePlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { forViewer } from "@/lib/gendered-copy";
import { requestPushPermission } from "@/lib/push-client";
import {
  currentDevice,
  openInBrowserUrl,
  pushPermission,
  pushStage,
  type Device,
  type PushPermission,
  type PushStage,
} from "@/lib/install-env";
import { CopyLink, INSTALL_GUIDE_URL, UnblockSteps } from "@/components/shared/install-guide";

/**
 * Guided notification setup for phones (most members arrive from Instagram ads, whose browser can't
 * install the site or show notifications). It works out where the member is and shows only the next
 * step, with one big button and a drawing of what to tap:
 *   iPhone:  open in Safari → add to the home screen → allow notifications
 *   Android: open in Chrome → allow notifications
 * Used by the bottom sheet (NotificationBar, home card, auto-open) and the /dashboard/install page.
 */

const IN_APP_NAME: Record<NonNullable<Device["inApp"]>, string> = {
  instagram: "إنستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  other: "تطبيق آخر",
};

const PUSH_CHANGED_EVENT = "naseeb:push-state-changed";

function subscribePush(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  window.addEventListener(PUSH_CHANGED_EVENT, onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
    window.removeEventListener(PUSH_CHANGED_EVENT, onChange);
  };
}
/** A string so React can compare snapshots; the device itself is derived from it */
const pushSnapshot = () => `${pushPermission()}|${currentDevice().standalone}`;
const serverPushSnapshot = () => null;

/** Device + permission, re-read when the member comes back to the tab (after settings, another app). */
export function usePushState() {
  const key = useSyncExternalStore(subscribePush, pushSnapshot, serverPushSnapshot);
  const device = useMemo(() => (key ? currentDevice() : null), [key]);
  const permission = key ? (key.split("|")[0] as PushPermission) : null;
  const stage: PushStage | null = device && permission ? pushStage(device, permission) : null;
  const refresh = useCallback(() => window.dispatchEvent(new Event(PUSH_CHANGED_EVENT)), []);
  return { device, permission, stage, refresh };
}

type StepKey = "browser" | "install" | "allow";

function stepsFor(device: Device): { key: StepKey; label: string }[] {
  const browser = device.os === "ios" ? "Safari" : "Chrome";
  return device.os === "ios"
    ? [
        { key: "browser", label: `فتح ${browser}` },
        { key: "install", label: "إضافة للشاشة" },
        { key: "allow", label: "تفعيل" },
      ]
    : [
        { key: "browser", label: `فتح ${browser}` },
        { key: "allow", label: "تفعيل" },
      ];
}

function Progress({ device, stage }: { device: Device; stage: PushStage }) {
  const steps = stepsFor(device);
  const current = stage === "blocked" ? "allow" : stage;
  const at = stage === "done" ? steps.length : Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <ol className="flex items-center gap-1.5" aria-label="خطوات تفعيل الإشعارات">
      {steps.map((s, i) => {
        const done = i < at;
        const active = i === at;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                done && "bg-emerald-600 text-white",
                active && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("truncate text-xs", active ? "font-bold text-foreground" : "text-muted-foreground")}>{s.label}</span>
            {i < steps.length - 1 && <span className={cn("h-px flex-1", done ? "bg-emerald-600/50" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ─── Drawings of what to tap (no screenshots: they go out of date with every iOS release) ─── */

function Mock({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border bg-muted/40 p-3", className)} aria-hidden="true">{children}</div>;
}

/** The thing to tap: gold ring + gentle pulse */
function Tap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center rounded-xl bg-accent/20 ring-2 ring-accent", className)}>
      <span className="absolute inset-0 animate-ping rounded-xl ring-2 ring-accent/40 motion-reduce:hidden" />
      {children}
    </span>
  );
}

function StepCard({ n, title, children }: { n: number; title: ReactNode; children: ReactNode }) {
  return (
    <li className="space-y-2">
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
        <span className="pt-0.5">{title}</span>
      </p>
      {children}
    </li>
  );
}

const B = ({ children }: { children: ReactNode }) => <span className="font-bold text-foreground">{children}</span>;

/** Instagram / Facebook top bar with the menu button */
function InAppBarMock({ device }: { device: Device }) {
  return (
    <Mock>
      <div className="flex items-center justify-between rounded-xl bg-card px-3 py-2 text-muted-foreground shadow-sm" dir="ltr">
        <X className="h-4 w-4" />
        <span className="text-xs">naseebak.com</span>
        <Tap className="h-8 w-8 text-foreground">{device.os === "ios" ? <MoreHorizontal className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}</Tap>
      </div>
      <div className="mt-2 ms-auto w-56 max-w-full rounded-xl bg-card p-1.5 shadow-sm" dir="ltr">
        <div className="rounded-lg px-2.5 py-2 text-xs text-muted-foreground">Copy link</div>
        <Tap className="w-full justify-start gap-2 px-2.5 py-2 text-xs font-semibold text-foreground">
          <ExternalLink className="h-4 w-4" />
          {device.os === "ios" ? "Open in external browser" : "Open in Chrome"}
        </Tap>
      </div>
    </Mock>
  );
}

/** Safari's bottom bar (share button), or Chrome's top bar on iPhone */
function ShareBarMock({ chrome }: { chrome: boolean }) {
  return (
    <Mock>
      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-muted-foreground shadow-sm" dir="ltr">
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="flex-1 rounded-lg bg-muted px-2 py-1 text-center text-xs">naseebak.com</span>
        <Tap className="h-8 w-8 text-primary"><Share className="h-5 w-5" /></Tap>
        {!chrome && <MoreHorizontal className="h-5 w-5" />}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {chrome ? "زر المشاركة في أعلى الشاشة بجانب الرابط" : "زر المشاركة أسفل الشاشة. إن لم تجده اضغط «⋯» ثم «مشاركة»"}
      </p>
    </Mock>
  );
}

function ShareSheetMock() {
  return (
    <Mock>
      <div className="space-y-1 rounded-xl bg-card p-1.5 shadow-sm">
        <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground">نسخ · Copy</div>
        <Tap className="w-full justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-foreground">
          <span>
            إضافة إلى الشاشة الرئيسية
            <span dir="ltr" className="block text-[11px] font-normal text-muted-foreground">Add to Home Screen</span>
          </span>
          <SquarePlus className="h-5 w-5 shrink-0" />
        </Tap>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">مرّر القائمة للأسفل إن لم يظهر الخيار</p>
    </Mock>
  );
}

function AddButtonMock() {
  return (
    <Mock>
      <div className="flex items-center justify-between rounded-xl bg-card px-3 py-2 text-xs shadow-sm" dir="ltr">
        <span className="text-muted-foreground">Cancel</span>
        <span className="font-semibold">Add to Home Screen</span>
        <Tap className="px-2.5 py-1 font-bold text-primary">Add · إضافة</Tap>
      </div>
    </Mock>
  );
}

function HomeIconMock() {
  return (
    <Mock className="flex items-center justify-center gap-6 py-4">
      {[0, 1].map((i) => (
        <span key={i} className="h-12 w-12 rounded-[14px] bg-muted" />
      ))}
      <span className="flex flex-col items-center gap-1">
        <Tap className="rounded-[14px] p-0">
          <Image src="/images/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 rounded-[14px]" />
        </Tap>
        <span className="text-[11px] font-semibold">نصيبك</span>
      </span>
    </Mock>
  );
}

function AllowPromptMock() {
  return (
    <Mock>
      <div className="mx-auto max-w-64 overflow-hidden rounded-xl bg-card text-center shadow-sm">
        <p className="px-4 pt-3 text-xs font-semibold leading-relaxed">«نصيبك» يريد إرسال إشعارات إليك</p>
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">تنبيهات، أصوات، شارات</p>
        <div className="grid grid-cols-2 border-t border-border text-xs">
          <span className="border-e border-border py-2.5 text-muted-foreground">عدم السماح</span>
          <Tap className="m-1 rounded-lg py-1.5 font-bold text-primary">السماح · Allow</Tap>
        </div>
      </div>
    </Mock>
  );
}

/* ─── The flow ─── */

export function PushSetupFlow({
  gender,
  onDone,
  compact = false,
}: {
  gender?: string | null;
  /** Called after "تم" on the success screen (closes the sheet) */
  onDone?: () => void;
  /** Hide the progress row (the page shows its own heading) */
  compact?: boolean;
}) {
  const { device, permission, stage, refresh } = usePushState();
  const [busy, setBusy] = useState(false);
  const v = (m: string, f: string) => forViewer(gender, m, f);

  if (!device || !stage || !permission) return null;

  async function allow() {
    setBusy(true);
    try {
      await requestPushPermission();
    } finally {
      refresh();
      setBusy(false);
    }
  }

  const browserName = device.os === "ios" ? "Safari" : "Chrome";
  let body: ReactNode;

  if (stage === "browser") {
    const href = openInBrowserUrl(device, `${INSTALL_GUIDE_URL}?from=app`);
    const appName = device.inApp ? IN_APP_NAME[device.inApp] : null;
    body = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl">{v(`افتح نصيبك في ${browserName}`, `افتحي نصيبك في ${browserName}`)}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {appName ? (
              <>
                {v("أنت تتصفح الآن من داخل", "أنتِ تتصفحين الآن من داخل")} <B>{appName}</B>، وهو لا يسمح بالإشعارات.
              </>
            ) : (
              "هذا المتصفح لا يدعم الإشعارات."
            )}{" "}
            {v("اضغط الزر لينتقل نصيبك إلى", "اضغطي الزر لينتقل نصيبك إلى")} {browserName}:
          </p>
        </div>
        {href && device.inApp && (
          <Button asChild size="lg" className="h-14 w-full gap-2 text-base">
            <a href={href}>
              <ExternalLink className="h-5 w-5" />
              افتح في {browserName}
            </a>
          </Button>
        )}
        <p className="rounded-xl bg-primary/5 p-3 text-xs leading-relaxed text-foreground/80">
          {v(
            `في ${browserName} قد يُطلب منك تسجيل الدخول برقمك مرة واحدة، ثم تكمل من نفس المكان.`,
            `في ${browserName} قد يُطلب منكِ تسجيل الدخول برقمكِ مرة واحدة، ثم تكملين من نفس المكان.`
          )}
        </p>
        {device.inApp ? (
          <details className="group rounded-xl border border-border p-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">
              لم يفتح؟ الطريقة اليدوية
              <ChevronLeft className="h-4 w-4 transition-transform group-open:-rotate-90" />
            </summary>
            <ol className="mt-3 space-y-4">
              <StepCard n={1} title={<>اضغط زر <B>{device.os === "ios" ? "⋯" : "⋮"}</B> في أعلى الشاشة، ثم <B>«{device.os === "ios" ? "فتح في المتصفح الخارجي" : "فتح في Chrome"}»</B></>}>
                <InAppBarMock device={device} />
              </StepCard>
              <StepCard n={2} title={<>أو انسخ الرابط والصقه في {browserName}:</>}>
                <CopyLink />
              </StepCard>
            </ol>
          </details>
        ) : (
          <CopyLink />
        )}
      </div>
    );
  } else if (stage === "install") {
    const chrome = device.browser === "chrome";
    body = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl">{v("أضف نصيبك إلى شاشة هاتفك", "أضيفي نصيبك إلى شاشة هاتفكِ")}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            على iPhone تصل الإشعارات فقط عندما يُفتح نصيبك من أيقونته. ثلاث ضغطات، ثم افتحه من الأيقونة:
          </p>
        </div>
        <ol className="space-y-5">
          <StepCard n={1} title={<>اضغط زر <B>المشاركة</B> <Share className="inline h-4 w-4 align-text-bottom text-primary" /></>}>
            <ShareBarMock chrome={chrome} />
          </StepCard>
          <StepCard n={2} title={<>اختر <B>«إضافة إلى الشاشة الرئيسية»</B></>}>
            <ShareSheetMock />
          </StepCard>
          <StepCard n={3} title={<>اضغط <B>«إضافة»</B></>}>
            <AddButtonMock />
          </StepCard>
          <StepCard n={4} title={<>{v("افتح نصيبك من", "افتحي نصيبك من")} <B>الأيقونة الجديدة</B> {v("وفعّل الإشعارات من هناك", "وفعّلي الإشعارات من هناك")}</>}>
            <HomeIconMock />
          </StepCard>
        </ol>
      </div>
    );
  } else if (stage === "allow") {
    body = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl">{v("خطوة أخيرة: فعّل الإشعارات", "خطوة أخيرة: فعّلي الإشعارات")}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {v("اضغط الزر، ثم اختر", "اضغطي الزر، ثم اختاري")} <B>«السماح»</B> في النافذة التي ستظهر.
          </p>
        </div>
        <Button size="lg" onClick={allow} disabled={busy} className="h-14 w-full gap-2 text-base">
          <BellRing className="h-5 w-5" />
          تفعيل الإشعارات
        </Button>
        <AllowPromptMock />
      </div>
    );
  } else if (stage === "blocked") {
    body = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl">الإشعارات مغلقة على هذا الجهاز</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {v("سبق أن اخترت «عدم السماح»، فلا يمكن طلبها من جديد من داخل الموقع. افتحها من الإعدادات:", "سبق أن اخترتِ «عدم السماح»، فلا يمكن طلبها من جديد من داخل الموقع. افتحيها من الإعدادات:")}
          </p>
        </div>
        <UnblockSteps device={device} />
        <Button variant="outline" size="lg" onClick={() => window.location.reload()} className="h-12 w-full gap-2">
          <RotateCw className="h-4 w-4" />
          {v("فعّلتها، تحقّق الآن", "فعّلتها، تحقّقي الآن")}
        </Button>
      </div>
    );
  } else if (stage === "done") {
    body = (
      <div className="space-y-4 py-2 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
          <Check className="h-8 w-8" />
        </span>
        <div className="space-y-1.5">
          <h3 className="font-display text-xl">الإشعارات مفعّلة</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {v("ستصلك الاقتراحات والتوافق والرسائل فور حدوثها.", "ستصلكِ الاقتراحات والتوافق والرسائل فور حدوثها.")}
          </p>
        </div>
        {onDone && (
          <Button size="lg" onClick={onDone} className="h-12 w-full">
            تم
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {device.os === "ios"
          ? "الإشعارات تحتاج iPhone بنظام iOS 16.4 أو أحدث. حدّث النظام من الإعدادات ← عام ← تحديث البرنامج."
          : "هذا المتصفح لا يدعم الإشعارات. افتح نصيبك في Chrome."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {!compact && stage !== "none" && <Progress device={device} stage={stage} />}
      {body}
    </div>
  );
}

/** The flow in a bottom sheet (phones) — opened by the bar, the home card or once a day on its own. */
export function PushSetupSheet({
  open,
  onOpenChange,
  gender,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gender?: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        closeLabel="لاحقاً"
        // No focus ring on the first link when it opens by itself (phones)
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg"
      >
        <SheetTitle className="sr-only">تفعيل الإشعارات</SheetTitle>
        <SheetDescription className="sr-only">خطوات تفعيل إشعارات نصيبك على هذا الجهاز</SheetDescription>
        <span className="mx-auto -mt-2 mb-1 block h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
        <PushSetupFlow gender={gender} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
