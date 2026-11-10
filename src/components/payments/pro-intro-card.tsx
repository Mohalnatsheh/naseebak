"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, Crown, X } from "lucide-react";
import { ProBadge } from "@/components/shared/pro-badge";
import { forViewer } from "@/lib/gendered-copy";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";

const HIDDEN_KEY = "naseeb:pro-intro-hidden";
const CHANGED = "naseeb:pro-intro-hidden-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}
function readHidden(): string | null {
  try {
    return localStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
}

/** The home card is for a member who can buy Pro right now and isn't Pro (`showPage` without `isPro`) */
export function proIntroShown(pro: { isPro: boolean; cancelAtPeriodEnd: boolean; showPage?: boolean } | undefined): boolean {
  return !!pro?.showPage && !pro.isPro;
}

/**
 * «جديد: عضوية Pro» on the dashboard home (owner, 2026-11-10): what Pro gives and a link to its page. Navy, so the
 * gold fills are allowed. ✕ hides it on this device for good. The caller decides whether it shows (`proIntroShown`).
 */
export function ProIntroCard({ gender, chatOn }: { gender?: string | null; /** chat_enabled: chat media only when chat is on */ chatOn: boolean }) {
  // Unknown on the server: treated as hidden, so nothing flashes in and then away
  const stored = useSyncExternalStore(subscribe, readHidden, () => "server");
  if (stored !== null) return null;

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // private mode: nothing to remember it in
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  const gives = chatOn
    ? "صور ورسائل صوتية في المحادثة، شارة Pro على بطاقتك، وأولوية في الاقتراحات."
    : "شارة Pro على بطاقتك، وأولوية في الاقتراحات.";

  return (
    <section
      aria-labelledby="pro-intro-title"
      className="landing-night relative overflow-hidden rounded-2xl px-4 py-4 text-white shadow-md shadow-primary/15"
    >
      <div className="landing-khatam absolute inset-0" aria-hidden />
      <button
        type="button"
        onClick={hide}
        aria-label="إخفاء"
        // z-10: the text row below is `relative` and comes later, so it would sit on top of ✕ and swallow the tap
        className="absolute end-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="relative flex items-start gap-3 pe-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/70 text-primary-deep shadow-sm">
          <Crown className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent px-2 py-0.5 text-caption font-bold text-primary-deep">جديد</span>
            <h2 id="pro-intro-title" className="flex items-center gap-1.5 text-base font-bold">
              عضوية <ProBadge size="md" onDark inText />
            </h2>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-white/80">{gives}</p>
          {/* No plan facts here: plans, prices and credits are set per country in Admin → Countries; the Pro page shows them */}
          <p className="mt-1 text-xs text-white/60">يمكنك الاطلاع على الباقات وأسعارها في صفحة العضوية.</p>
        </div>
      </div>
      <Link
        href={PRO_PAGE_PATH}
        className="relative mt-3.5 flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-accent text-sm font-bold text-primary-deep transition hover:bg-accent/90 sm:w-auto sm:px-5"
      >
        {forViewer(gender, "اكتشف Pro", "اكتشفي Pro")}
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
