"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEALBREAKER_KEYS, DEALBREAKER_LABELS, type DealbreakerKey } from "@/lib/matching/score";

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

/** What the user asked for, in words; null when that preference isn't filled in (so it can't be a dealbreaker). */
function prefSummary(key: DealbreakerKey, p: Prefs): string | null {
  const list = (v: string[]) => (v && v.length > 0 ? v.join("، ") : null);
  switch (key) {
    case "age":
      return p.prefAgeMin || p.prefAgeMax ? `${p.prefAgeMin ?? "—"} – ${p.prefAgeMax ?? "—"} سنة` : null;
    case "city": return list(p.prefCity);
    case "education": return list(p.prefEducation);
    case "maritalStatus": return list(p.prefMaritalStatus);
    case "religiosity": return list(p.prefReligiosity);
    case "smokingStatus": return list(p.prefSmokingStatus);
    case "hijab": return p.prefHijab ? (p.prefHijab === "yes" ? "محجبة" : "غير محجبة") : null;
    case "beard": return p.prefBeard ? (p.prefBeard === "yes" ? "ملتحٍ" : "بدون لحية") : null;
    case "children": return p.prefChildrenAcceptance === "no_children" ? "بدون أبناء" : null;
  }
}

/** "شروطي الأساسية": the preferences that must be met before anyone is suggested to me. */
export function DealbreakersCard() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile/dealbreakers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.profile) return;
        setPrefs(d.profile);
        setSelected(new Set(d.profile.dealbreakers ?? []));
      })
      .catch(() => {});
  }, []);

  const available = prefs
    ? DEALBREAKER_KEYS.map((k) => ({ key: k, summary: prefSummary(k, prefs) })).filter((x) => x.summary)
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
                {activeCount > 0 ? `${activeCount} من تفضيلاتك شرط لا تنازل عنه` : "حدّد ما لا تقبل التنازل عنه"}
              </p>
            </div>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              الشرط الأساسي يعني أننا لن نقترح عليك أي شخص لا يحقّقه. اختر بعناية: كثرة الشروط تقلّل الاقتراحات. شروطك خاصة ولا يراها أحد.
            </p>
            {!prefs ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : available.length === 0 ? (
              <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                أضف تفضيلاتك في ملفك الشخصي أولاً لتتمكن من تحديد شروطك الأساسية.{" "}
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
