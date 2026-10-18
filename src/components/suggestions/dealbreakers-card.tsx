"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEALBREAKER_KEYS, DEALBREAKER_LABELS } from "@/lib/matching/score";
import { dealbreakerSummary } from "@/lib/matching/dealbreaker-summary";
import { useDashboardData } from "@/contexts/dashboard-context";

interface Prefs {
  dealbreakers: string[];
  prefAgeMin: number | null;
  prefAgeMax: number | null;
  prefCity: string[];
  prefEducation: string[];
  prefMaritalStatus: string[];
  prefReligiosity: string[];
  prefSmokingStatus: string[];
  prefHijab: string | null;
  prefBeard: string | null;
  prefChildrenAcceptance: string | null;
}

/** "شروطي الأساسية": the preferences that must be met before anyone is suggested to me. */
export function DealbreakersCard() {
  const gender: string | undefined = useDashboardData().profile?.gender;
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        setSelected(new Set(d?.profile?.dealbreakers ?? []));
      })
      .catch(() => setLoadFailed(true));
  }, [reloadKey]);

  const available = prefs
    ? DEALBREAKER_KEYS.map((k) => ({ key: k, summary: dealbreakerSummary(k, prefs, gender) })).filter((x) => x.summary)
    : [];
  const activeCount = available.filter((a) => selected.has(a.key)).length;

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const res = await fetch("/api/profile/dealbreakers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: available.map((a) => a.key).filter((k) => selected.has(k)) }),
    }).catch(() => null);
    if (res?.ok) setSaved(true);
    else setError("تعذّر الحفظ. حاول مرة أخرى.");
    setSaving(false);
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/30 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="text-start min-w-0">
              <p className="font-bold text-sm text-foreground">شروطي الأساسية</p>
              <p className="text-xs text-muted-foreground truncate">
                {activeCount > 0
                  ? `${activeCount} من تفضيلاتك ${g("شرط لا تتنازل عنه", "شرط لا تتنازلين عنه")}`
                  : g("حدّد ما لا تقبل التنازل عنه", "حدّدي ما لا تقبلين التنازل عنه")}
              </p>
            </div>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {g(
                "الشرط الأساسي يعني أننا لن نقترح عليك أي شخص لا يحقّقه. اختر بعناية: كثرة الشروط تقلّل الاقتراحات. شروطك خاصة ولا يراها أحد.",
                "الشرط الأساسي يعني أننا لن نقترح عليكِ أي شخص لا يحقّقه. اختاري بعناية: كثرة الشروط تقلّل الاقتراحات. شروطكِ خاصة ولا يراها أحد."
              )}
            </p>
            {loadFailed ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
                تعذّر تحميل شروطك.
                <Button type="button" variant="outline" className="h-11" onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : !prefs ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : available.length === 0 ? (
              <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                {g(
                  "أضف تفضيلاتك في ملفك الشخصي أولاً لتتمكن من تحديد شروطك الأساسية.",
                  "أضيفي تفضيلاتكِ في ملفكِ الشخصي أولاً لتتمكني من تحديد شروطكِ الأساسية."
                )}{" "}
                <Link href="/dashboard/profile" className="font-semibold text-primary underline-offset-4 hover:underline">
                  ملفي الشخصي
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {available.map(({ key, summary }) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{DEALBREAKER_LABELS[key]}</p>
                        <p className="text-xs text-muted-foreground truncate">{summary}</p>
                      </div>
                      <Switch
                        checked={selected.has(key)}
                        onCheckedChange={(v) => {
                          setSaved(false);
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
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={save} disabled={saving} className="rounded-xl font-semibold">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الشروط"}
                  </Button>
                  {saved && (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                      <Check className="h-4 w-4" /> تم الحفظ. تُطبَّق على الاقتراحات القادمة.
                    </span>
                  )}
                  {error && <span className="text-sm text-destructive">{error}</span>}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
