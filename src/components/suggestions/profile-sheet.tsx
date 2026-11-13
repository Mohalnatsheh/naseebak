"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { WhyLine } from "@/components/shared/person-card";
import { CandidateDetails } from "@/components/suggestions/candidate-details";
import { useDashboardData } from "@/contexts/dashboard-context";
import { forPartner } from "@/lib/gendered-copy";
import type { FeedItem } from "@/lib/suggestions/feed-types";

/** The queued removal of the `#profile` history entry (module-wide: a re-open must be able to cancel it) */
let pendingRemoval: ReturnType<typeof setTimeout> | null = null;

/**
 * The whole profile of a suggested person in one scroll (home/suggestions redesign): a panel from the inline-end side
 * (the physical left in RTL) at 440 px on ≥ md, full-screen on phones. Nothing collapsed; the answers (`footer`) are
 * pinned at the bottom and the ⋮ menu (`menu`) sits in the header. Esc, ✕ and the browser's back button close it;
 * the focus returns to what opened it. No photo: the avatar stays locked until a mutual «مهتم».
 */
export function ProfileSheet({
  item,
  onClose,
  footer,
  menu,
}: {
  item: FeedItem | null;
  onClose: () => void;
  footer: ReactNode;
  menu?: ReactNode;
}) {
  const open = item !== null;
  const { profile } = useDashboardData();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Who had the focus when it opened: Radix has no trigger here, so we give it back ourselves
  const openerRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    // Layout effects run before Radix moves the focus into the panel
    if (open) openerRef.current = document.activeElement;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    return () => {
      openerRef.current = null;
      // After the sheet is gone (not on StrictMode's re-run: then a dialog is already back)
      setTimeout(() => {
        if (document.querySelector('[role="dialog"]')) return;
        if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
      }, 0);
    };
  }, [open]);

  // Browser back closes it: one history entry while open. Removal is deferred a tick and cancelled by a re-open
  // (StrictMode's mount, cleanup, mount, or a close and reopen at once), so the queued back never closes a new sheet.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let entryOpen = true;
    if (pendingRemoval !== null) {
      clearTimeout(pendingRemoval);
      pendingRemoval = null; // the entry from the last open is still there: reuse it
    } else {
      try {
        window.history.pushState({ profileSheet: true }, "", `${window.location.pathname}${window.location.search}#profile`);
      } catch {
        entryOpen = false;
      }
    }
    const onPop = () => {
      entryOpen = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!entryOpen) return;
      pendingRemoval = setTimeout(() => {
        pendingRemoval = null;
        try {
          if ((window.history.state as { profileSheet?: boolean } | null)?.profileSheet) window.history.back();
        } catch {
          /* no history: nothing to remove */
        }
      }, 0);
    };
  }, [open]);

  if (!item) return null;
  const c = item.candidate;
  const gender = profile?.gender;
  const title = c.age ? `${c.firstName}، ${c.age}` : c.firstName;
  const meta = [c.city, item.activity].filter(Boolean).join(" · ");

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-full gap-0 border-0 p-0 sm:max-w-none md:w-[440px] md:border-e"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1.5">
          <div className="flex items-center gap-1 ms-auto">
            {menu}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>
        <SheetDescription className="sr-only">الملف الكامل</SheetDescription>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <MemberAvatar name={c.firstName} size={96} locked />
            <SheetTitle className="font-display text-title">{title}</SheetTitle>
            <p className="text-label text-muted-foreground">
              {meta}
              {meta ? " · " : ""}
              <span className="text-accent-ink">توافق {Math.round(item.compatibilityScore)}%</span>
            </p>
            <p className="text-caption text-muted-foreground">الصور تظهر بعد التوافق المتبادل فقط</p>
          </div>

          <div className="mt-5 space-y-4">
            <WhyLine>{item.reason}</WhyLine>
            {c.aboutMe && (
              <section>
                <h3 className="mb-1.5 text-label font-bold text-foreground">{forPartner(gender, "عنه", "عنها")}</h3>
                <p className="whitespace-pre-line text-body text-ink">{c.aboutMe}</p>
              </section>
            )}
            <CandidateDetails c={c} flat />
          </div>
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-border/60 bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      </SheetContent>
    </Sheet>
  );
}
