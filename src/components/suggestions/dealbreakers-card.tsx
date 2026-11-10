"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Loader2, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DEALBREAKER_KEYS, DEALBREAKER_LABELS } from "@/lib/matching/score";
import { dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";
import { useDashboardData } from "@/contexts/dashboard-context";
import { sectApplies } from "@/lib/profile-sect";
import { cn } from "@/lib/utils";

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
export function DealbreakersCard() {
  const { profile, country } = useDashboardData();
  const gender: string | undefined = profile?.gender;
  // The «المذهب» condition exists for Lebanese members only
  const sectOn = sectApplies(country);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  /** What is saved on the server (the chips) */
  const [saved, setSaved] = useState<Set<string>>(new Set());
  /** What the switches show while editing */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");
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
        setSelected(new Set(keys));
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
        .map((k) => ({ key: k, summary: dealbreakerSummary(k, prefs, gender) }))
        .filter((x) => x.summary)
    : [];
  const active = available.filter((a) => saved.has(a.key));

  function openEditor() {
    setSelected(new Set(saved));
    setJustSaved(false);
    setError("");
    setOpen(true);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Closing drops the hash, so the same link opens it again later
    if (!next && window.location.hash === HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setJustSaved(false);
    const keys = available.map((a) => a.key).filter((k) => selected.has(k));
    const res = await fetch("/api/profile/dealbreakers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(new Set(keys));
      setJustSaved(true);
    } else {
      setError("تعذّر الحفظ. يمكنك المحاولة مرة أخرى.");
    }
    setSaving(false);
  }

  return (
    <div id="dealbreakers" className="scroll-mt-24">
      {/* The filter bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openEditor}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
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

      {/* The editor */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl px-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-5 text-start">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden /> شروطي الأساسية
            </SheetTitle>
            <SheetDescription className="leading-relaxed">
              {g(
                "لن نقترح عليك أي شخص لا يحقّق الشرط المفعّل. كثرة الشروط تقلّل الاقتراحات. شروطك خاصة ولا يراها أحد.",
                "لن نقترح عليكِ أي شخص لا يحقّق الشرط المفعّل. كثرة الشروط تقلّل الاقتراحات. شروطكِ خاصة ولا يراها أحد."
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-2 px-5">
            {loadFailed ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
                تعذّر تحميل شروطك.
                <Button type="button" variant="outline" className="h-11" onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : !prefs ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden /></div>
            ) : available.length === 0 ? (
              <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                {g(
                  "أضف تفضيلاتك في ملفك الشخصي أولاً لتتمكن من تحديد شروطك الأساسية.",
                  "أضيفي تفضيلاتكِ في ملفكِ الشخصي أولاً لتتمكني من تحديد شروطكِ الأساسية."
                )}{" "}
                <Link href="/dashboard/profile/edit?step=3" className="font-semibold text-primary underline-offset-4 hover:underline">
                  تفضيلاتي
                </Link>
              </div>
            ) : (
              available.map(({ key, summary }) => (
                <label key={key} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{DEALBREAKER_LABELS[key]}</span>
                    <span className="block truncate text-xs text-muted-foreground">{summary}</span>
                  </span>
                  <Switch
                    checked={selected.has(key)}
                    onCheckedChange={(v) => {
                      setJustSaved(false);
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                    }}
                    aria-label={`${DEALBREAKER_LABELS[key]} شرط أساسي`}
                  />
                </label>
              ))
            )}
            {available.length > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                {g("القيم من تفضيلاتك.", "القيم من تفضيلاتكِ.")}{" "}
                <Link href="/dashboard/profile/edit?step=3" className="font-semibold text-primary underline-offset-4 hover:underline">
                  تعديل تفضيلاتي
                </Link>
              </p>
            )}
          </div>

          {available.length > 0 && (
            <SheetFooter className="gap-2 px-5">
              {justSaved && (
                <p role="status" className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" aria-hidden /> تم الحفظ. تُطبَّق على الاقتراحات القادمة.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button onClick={save} disabled={saving} className="h-12 w-full rounded-xl text-base font-bold">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "حفظ الشروط"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
