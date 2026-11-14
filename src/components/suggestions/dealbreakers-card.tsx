"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DEALBREAKER_KEYS, DEALBREAKER_LABELS } from "@/lib/matching/score";
import { dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";
import { useDashboardData } from "@/contexts/dashboard-context";
import { sectApplies } from "@/lib/profile-sect";
import { MUSLIM_ONLY_DEALBREAKERS, isChristian, type ReligionProfile } from "@/lib/profile-religion";
import { cn } from "@/lib/utils";
import { PartnerPrefsEditor } from "@/components/suggestions/partner-prefs-editor";

interface Prefs {
  dealbreakers: string[];
  prefAgeMin: number | null;
  prefAgeMax: number | null;
  prefCity: string[];
  prefEducation: string[];
  prefMaritalStatus: string[];
  prefReligiosity: string[];
  prefSmokingStatus: string[];
  /** «المذهب لدى الشريك»: Lebanese members only */
  prefSect?: string[] | null;
  prefHijab: string | null;
  prefBeard: string | null;
  prefChildrenAcceptance: string | null;
}

/** Opening the page with #dealbreakers (account page, empty states) opens the editor */
const HASH = "#dealbreakers";

/**
 * «شروطي الأساسية» as a filter bar at the top of «الجديد»: the conditions that are on, as chips, and
 * «تعديل» opening a bottom sheet with one switch per condition (the preferences that must be met before
 * anyone is suggested). Same API as before (GET/PUT /api/profile/dealbreakers); private to the member.
 */
export function DealbreakersCard({
  onSaved,
  asDialog = false,
}: {
  /** The conditions were saved: the server is closing and refilling cards, so the list should reload */
  onSaved?: () => void;
  /** Switch dashboard_redesign: the editor is a centred window (Dialog) instead of a bottom sheet; same content and saving */
  asDialog?: boolean;
} = {}) {
  const { profile, country } = useDashboardData();
  const gender: string | undefined = profile?.gender;
  // The «المذهب» condition exists for Lebanese members only
  const sectOn = sectApplies(country);
  // A Christian has no hijab, beard or «المذهب» condition
  const christian = isChristian(profile?.profile as ReligionProfile | null | undefined);
  const muslimOnly: readonly string[] = MUSLIM_ONLY_DEALBREAKERS;
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  /** What is saved on the server (the chips) */
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const female = gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (female ? feminine : masculine);

  useEffect(() => {
    fetch("/api/profile/dealbreakers")
      .then((r) => {
        if (!r.ok) throw new Error(`dealbreakers ${r.status}`);
        return r.json();
      })
      .then((d) => {
        // No profile yet: show the "add your preferences first" state rather than a spinner forever
        setPrefs(d?.profile ?? {});
        const keys = new Set<string>(d?.profile?.dealbreakers ?? []);
        setSaved(keys);
      })
      .catch(() => setLoadFailed(true));
  }, [reloadKey]);

  // #dealbreakers opens the editor (and again when the hash changes to it)
  useEffect(() => {
    const check = () => {
      if (window.location.hash === HASH) setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const available = prefs
    ? DEALBREAKER_KEYS.filter((k) => k !== "sect" || sectOn)
        .filter((k) => !christian || !muslimOnly.includes(k))
        .map((k) => ({ key: k, summary: dealbreakerSummary(k, prefs, gender) }))
        .filter((x) => x.summary)
    : [];
  const active = available.filter((a) => saved.has(a.key));

  function openEditor() {
    setOpen(true);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Closing drops the hash, so the same link opens it again later
    if (!next && window.location.hash === HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  /** Everything saved: close, reload the chips, and the list (the server is closing and refilling cards) */
  const afterSave = useCallback(() => {
    setOpen(false);
    if (window.location.hash === HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setReloadKey((k) => k + 1);
    onSaved?.();
  }, [onSaved]);

  const editorTitle = (
    <>
      <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden /> تفضيلات الشريك
    </>
  );
  const editorHint = g(
    "تفضيلاتك لا يراها أحد. ضع علامة «شرط أساسي» على ما لا تقبل التنازل عنه: لن نقترح عليك من لا يحققه. كثرة الشروط تقلّل الاقتراحات.",
    "تفضيلاتك لا يراها أحد. ضعي علامة «شرط أساسي» على ما لا تقبلين التنازل عنه: لن نقترح عليكِ من لا يحققه. كثرة الشروط تقلّل الاقتراحات."
  );
  return (
    <div id="dealbreakers" className="scroll-mt-24">
      {/* The filter bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openEditor}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex h-10 max-md:min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
            active.length > 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          شروطي الأساسية
          {active.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-caption text-accent-foreground">{active.length}</span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
          {active.length > 0 ? (
            active.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={openEditor}
                className="h-8 max-md:min-h-11 max-w-[11rem] shrink-0 truncate rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary"
                title={`${DEALBREAKER_LABELS[a.key]}: ${a.summary}`}
              >
                {DEALBREAKER_LABELS[a.key]}: {a.summary}
              </button>
            ))
          ) : prefs && !loadFailed ? (
            <button type="button" onClick={openEditor} className="inline-flex h-8 max-md:min-h-11 min-w-0 items-center gap-1 truncate rounded-full border border-dashed border-border px-3 text-xs font-semibold text-muted-foreground">
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{g("حدّد ما لا تتنازل عنه", "حدّدي ما لا تتنازلين عنه")}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* The editor (as the app's «تفضيلات الشريك»): a window with the switch on, the bottom sheet with it off. Mounted
          only while open, so it always loads the stored values */}
      {asDialog ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent dir="rtl" className="flex max-h-[85dvh] flex-col overflow-hidden">
            <DialogHeader className="shrink-0 text-start">
              <DialogTitle className="flex items-center gap-2 text-lg">{editorTitle}</DialogTitle>
              <DialogDescription className="leading-relaxed">{editorHint}</DialogDescription>
            </DialogHeader>
            {open && (
              <PartnerPrefsEditor
                onSaved={afterSave}
                renderFrame={(body, actions) => (
                  <>
                    <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1">{body}</div>
                    {actions && <DialogFooter className="shrink-0 gap-2 border-t border-border pt-3 sm:flex-col">{actions}</DialogFooter>}
                  </>
                )}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col overflow-hidden rounded-t-3xl px-0 pb-[env(safe-area-inset-bottom)]">
            <SheetHeader className="shrink-0 px-5 text-start">
              <SheetTitle className="flex items-center gap-2 text-lg">{editorTitle}</SheetTitle>
              <SheetDescription className="leading-relaxed">{editorHint}</SheetDescription>
            </SheetHeader>
            {open && (
              <PartnerPrefsEditor
                onSaved={afterSave}
                renderFrame={(body, actions) => (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-1">{body}</div>
                    {actions && <SheetFooter className="shrink-0 gap-2 border-t border-border px-5 pt-3">{actions}</SheetFooter>}
                  </>
                )}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
