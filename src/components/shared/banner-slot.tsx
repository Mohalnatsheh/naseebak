"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellOff, BellRing, ChevronLeft, Coins, Heart, Inbox, Lightbulb, PencilLine, X } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forViewer } from "@/lib/gendered-copy";
import { qualifiesForSuggestions } from "@/lib/profile-completeness";
import { matchesHref } from "@/lib/matches/links";
import { pickBanner, PUSH_SNOOZE_MS, type BannerKind } from "@/lib/banner-slot";
import { pageWidth, PAGE_WIDTH_CLASS } from "@/lib/page-width";
import { PushSetupSheet, usePushState } from "@/components/shared/push-setup";
import { OPEN_PUSH_SETUP_EVENT } from "@/components/shared/notification-bar";
import { cn } from "@/lib/utils";

/* ─── The page's own tip (priority 5): a page registers it with <PageTip>, the slot shows it when nothing else ─── */

interface Tip {
  storageKey: string;
  title: string;
  body: string;
}
const TipContext = createContext<{ tip: Tip | null; setTip: (t: Tip | null) => void }>({ tip: null, setTip: () => {} });

/** Registers this page's tip in the banner slot (shown once, until dismissed). Renders nothing itself. */
export function PageTip({ storageKey, title, body }: Tip) {
  const { setTip } = useContext(TipContext);
  useEffect(() => {
    setTip({ storageKey, title, body });
    return () => setTip(null);
  }, [setTip, storageKey, title, body]);
  return null;
}

/* ─── Remembered dismissals (localStorage, read only in the browser) ─── */

const PUSH_SNOOZE_KEY = "naseeb:push-nudge-snoozed-at";
const STORE_EVENT = "naseeb:banner-slot-changed";
function subscribeStore(onChange: () => void) {
  window.addEventListener(STORE_EVENT, onChange);
  return () => window.removeEventListener(STORE_EVENT, onChange);
}
function readPushSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(PUSH_SNOOZE_KEY));
    return !!at && Date.now() - at < PUSH_SNOOZE_MS;
  } catch {
    return false;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: nothing to remember it in; it shows again next visit
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}
function readTipDismissed(key: string | undefined): boolean {
  if (!key) return true;
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

/* ─── The line itself ─── */

export function BannerLine({
  icon: Icon,
  title,
  body,
  action,
  onDismiss,
  dismissLabel = "لاحقاً",
  kind,
}: {
  icon: typeof Heart;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  kind: BannerKind;
}) {
  return (
    <div
      role="region"
      aria-label="تنبيه"
      data-banner={kind}
      // Wraps instead of squeezing: at 200% text the action and ✕ go under the line (QA WM-05)
      className="animate-appear mb-4 flex min-h-14 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 basis-48 text-label font-normal text-ink">
        <b className="font-bold">{title}</b>
        {body ? <> {body}</> : null}
      </p>
      {(action || onDismiss) && (
        <div className="ms-auto flex shrink-0 items-center gap-1">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION = "inline-flex min-h-11 items-center gap-1 rounded-lg bg-primary px-3.5 text-label font-bold text-primary-foreground transition-colors hover:bg-primary/90";

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={ACTION}>
      {children}
      <ChevronLeft className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/**
 * The one banner slot (P1-5): picks the most important line for this member on this page and shows only that, above
 * the page title. Also hosts the guided notifications sheet (opened by any `openPushSetup()`).
 */
export function BannerSlot({ tip }: { tip: Tip | null }) {
  const pathname = usePathname() ?? "";
  const { profile, completeness, counts, loading } = useDashboardData();
  const { stage } = usePushState();
  const pushSnoozed = useSyncExternalStore(subscribeStore, readPushSnoozed, () => true);
  const tipDismissed = useSyncExternalStore(subscribeStore, () => readTipDismissed(tip?.storageKey), () => true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const gender = profile?.gender;
  const known = gender === "MALE" || gender === "FEMALE";
  // The profile didn't load (no gender yet): words that fit everyone, never a masculine command (QA WM-08)
  const v = (m: string, f: string, neutral = m) => (known ? forViewer(gender, m, f) : neutral);

  useEffect(() => {
    const onOpen = () => setSheetOpen(true);
    window.addEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUSH_SETUP_EVENT, onOpen);
  }, []);

  const sheet = <PushSetupSheet open={sheetOpen} onOpenChange={setSheetOpen} gender={gender} />;

  // Until the profile and the switches load, nothing (a banner that appears and is replaced would jump)
  const kind =
    loading || !profile
      ? null
      : pickBanner({
          pathname,
          setupDone: qualifiesForSuggestions({
            completenessTotal: completeness?.total ?? 0,
            isComplete: !!profile.profile?.isComplete,
            newCycle: counts.flags.introRequests,
          }),
          creditOnInterest: !!counts.flags.creditOnInterest,
          credits: counts.credits ?? profile.matchCredits ?? 0,
          likedYou: counts.flags.mutualSuggestions ? counts.likedYou ?? 0 : 0,
          pendingIntros: counts.flags.introRequests ? counts.pendingIntros : 0,
          pushNeeded: !!stage && stage !== "done" && stage !== "none",
          pushSnoozed,
          tip: !!tip && !tipDismissed,
        });

  let line: ReactNode = null;
  if (kind === "setup") {
    line = (
      <BannerLine
        kind={kind}
        icon={PencilLine}
        title={v("أكمل إعداد ملفك", "أكملي إعداد ملفكِ", "إعداد الملف لم يكتمل")}
        body="لتبدأ اقتراحاتك."
        action={<ActionLink href="/dashboard/profile/setup">متابعة</ActionLink>}
      />
    );
  } else if (kind === "zeroCredits") {
    const free = !!counts.flags.freeInterestReply;
    line = (
      <BannerLine
        kind={kind}
        icon={free ? Heart : Coins}
        title={v("شخص مهتم بك ينتظر ردّك.", "شخص مهتم بكِ ينتظر ردّكِ.")}
        body={free ? "الرد بـ«مهتم» مجاني حتى برصيد صفر." : v("انتهى رصيدك، اشحن لتردّ بـ«مهتم».", "انتهى رصيدكِ، اشحني لتردّي بـ«مهتمة».", "انتهى الرصيد.")}
        action={
          free ? (
            <ActionLink href="/dashboard/suggestions?tab=interested">{v("ردّ الآن", "ردّي الآن", "الرد")}</ActionLink>
          ) : (
            <ActionLink href="/dashboard/payments">{v("اشحن", "اشحني", "الشحن")}</ActionLink>
          )
        }
      />
    );
  } else if (kind === "familyRequest") {
    line = (
      <BannerLine
        kind={kind}
        icon={Inbox}
        title={counts.pendingIntros === 1 ? "طلب تعارف بانتظار ردّك." : `${counts.pendingIntros} طلبات تعارف بانتظار ردّك.`}
        body="تنتهي بعد 7 أيام من إرسالها."
        action={<ActionLink href={matchesHref(counts.flags.mutualSuggestions, counts.pendingIntroMatchId)}>{v("ردّ الآن", "ردّي الآن", "الرد")}</ActionLink>}
      />
    );
  } else if (kind === "push") {
    const blocked = stage === "blocked";
    line = (
      <BannerLine
        kind={kind}
        icon={blocked ? BellOff : BellRing}
        title={blocked ? "الإشعارات مغلقة على هذا الجهاز." : "الإشعارات غير مفعّلة."}
        body={v("لن تعرف بالتوافق والرسائل فور حدوثها.", "لن تعرفي بالتوافق والرسائل فور حدوثها.", "")}
        action={
          <button type="button" onClick={() => setSheetOpen(true)} className={ACTION}>
            {blocked ? "طريقة فتحها" : v("فعّلها الآن", "فعّليها الآن", "تفعيل الإشعارات")}
          </button>
        }
        onDismiss={() => remember(PUSH_SNOOZE_KEY, String(Date.now()))}
      />
    );
  } else if (kind === "tip" && tip) {
    line = (
      <BannerLine
        kind={kind}
        icon={Lightbulb}
        title={tip.title}
        body={tip.body}
        onDismiss={() => remember(tip.storageKey, "true")}
        dismissLabel="إخفاء النصيحة"
      />
    );
  }

  return (
    <>
      {line}
      {sheet}
    </>
  );
}

/**
 * The dashboard's content column: one of the two widths for this page, the banner slot on top, then the page.
 */
export function DashboardColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [tip, setTip] = useState<Tip | null>(null);
  return (
    <TipContext.Provider value={{ tip, setTip }}>
      <div
        data-page-width={pageWidth(pathname)}
        className={cn(
          PAGE_WIDTH_CLASS[pageWidth(pathname)],
          "mx-auto min-h-[calc(100dvh-58px-4rem)] px-4 py-6 md:min-h-dvh md:px-6 md:py-8",
        )}
      >
        <BannerSlot tip={tip} />
        {children}
      </div>
    </TipContext.Provider>
  );
}
