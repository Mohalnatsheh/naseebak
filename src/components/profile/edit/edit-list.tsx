"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Lock, UserPen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/page-loading";
import { useDashboardData } from "@/contexts/dashboard-context";
import { EDIT_SECTIONS, GUARDIAN_ROW_KEY, editField, fieldForOldStep, rowKeyOf, type EditField, type EditShowCtx } from "@/lib/profile-edit-fields";
import { rowState, type RowState } from "@/lib/profile-edit-state";
import { isEmptyStored } from "@/lib/profile-edit-split";
import { activeDealbreakers } from "@/lib/matching/dealbreaker-summary";
import { dealbreakerPrefsFor } from "@/lib/profile-religion";
import { veilChoice } from "@/lib/profile-veil";
import { forViewer } from "@/lib/gendered-copy";
import { cn } from "@/lib/utils";
import { GUARDIAN_RELATIONSHIPS, GuardianEditor } from "./guardian-editor";
import { RowEditor, rowKeys } from "./row-editor";
import { SaveBar } from "./save-bar";
import { useEditSession } from "./use-edit-session";

type Values = Record<string, unknown>;

const PROFILE_PATH = "/dashboard/profile";
const STATE_ORDER: RowState[] = ["pending", "locked", "review", "fill"];

/** One state for a row and its companions: pending/locked if any part is, review if any changed part is, else fill */
function combinedState(field: EditField, stored: Values, changes: Values, pendingKeys: string[] | null): RowState {
  const states = rowKeys(field).map((k) => rowState(k, stored, changes, pendingKeys));
  return STATE_ORDER.find((s) => states.includes(s)) ?? "idle";
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-JO-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What a row shows for these values; null = nothing yet («إضافة») */
function valueText(field: EditField, values: Values, ctx: EditShowCtx): string | null {
  const v = values[field.key];
  if (field.key === "hijab") return veilChoice(values.hijab as boolean | null, values.niqab as boolean | null);
  if (field.key === "prefAgeMin") {
    return isEmptyStored(values.prefAgeMin) || isEmptyStored(values.prefAgeMax) ? null : `من ${values.prefAgeMin} إلى ${values.prefAgeMax}`;
  }
  if (field.key === "city") return isEmptyStored(v) ? null : [v, values.area].filter((x) => !isEmptyStored(x)).join(" · ");
  if (field.control === "date") {
    if (isEmptyStored(v)) return null;
    const d = new Date(String(v).slice(0, 10));
    return Number.isNaN(d.getTime()) ? String(v) : DATE_FORMAT.format(d);
  }
  const options = field.options?.(ctx) ?? [];
  const labelOf = (x: string) => options.find((o) => o.value === x)?.label ?? x;
  if (field.control === "yesNo") return typeof v === "boolean" ? labelOf(String(v)) : null;
  if (field.control === "multi") return Array.isArray(v) && v.length > 0 ? v.map((x) => labelOf(String(x))).join("، ") : null;
  if (isEmptyStored(v)) return field.storedDefault ? labelOf(field.storedDefault) : null;
  if (field.control === "number") {
    const unit = field.unit?.(ctx.country);
    return unit ? `${v} ${unit}` : String(v);
  }
  if (field.control === "longText") return String(v).split("\n")[0];
  return labelOf(String(v));
}

function StateTag({ state }: { state: RowState }) {
  if (state === "fill") return <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-caption font-bold text-emerald-700">فوراً</span>;
  if (state === "review") return <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-caption font-bold text-primary">للمراجعة</span>;
  if (state === "pending") return <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-caption font-bold text-amber-800">قيد المراجعة</span>;
  return null;
}

/**
 * The link a click would follow inside the app, or null: a plain left click on a same-origin `<a href>` that
 * leaves this page (not a new tab, a download or a jump within the page).
 */
function inAppLink(e: MouseEvent): { anchor: HTMLAnchorElement; href: string } | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return null;
  return { anchor, href: `${url.pathname}${url.search}${url.hash}` };
}

/** The row a deep link asks for: `?field=KEY`, or the old wizard's `?step=N` */
function linkedRowKey(): string | null {
  const params = new URLSearchParams(window.location.search);
  const step = Number(params.get("step"));
  return params.get("field") ?? (step ? fieldForOldStep(step) : null);
}

/**
 * The profile edit list (`/dashboard/profile/edit`, switch `auth_profile_redesign`): every field in grouped rows,
 * one editor per row, one «حفظ» for all. Empty fields save at once, changes to stored values go to review, partner
 * preferences (with their «شرط أساسي») save at once even while a review request is pending. The guardian (website
 * only, last section) saves on its own from its editor.
 */
export function EditList() {
  const router = useRouter();
  const { counts, profile: me } = useDashboardData();
  const introMode = counts?.flags?.introRequests === true;
  const religionEnabled = counts?.religionEnabled === true;
  // «شرط أساسي» toggles only where the legacy edit page shows them (new suggestions flow)
  const showDealbreakers = counts?.flags?.mutualSuggestions === true;
  const s = useEditSession({ religionEnabled, showDealbreakers });
  const { status, gender, country, stored, changes, shown, pendingKeys, pendingChanges, dirty, plan } = s;
  // The open editor: a row key, GUARDIAN_ROW_KEY, or null. Undefined until the member opens or closes one: the
  // deep link decides meanwhile
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const ctx: EditShowCtx = useMemo(() => ({ gender, country, religionEnabled, profile: shown }), [gender, country, religionEnabled, shown]);
  const sections = useMemo(
    () => EDIT_SECTIONS.map((sec) => ({ ...sec, fields: sec.fields.filter((f) => !f.showIf || f.showIf(ctx)) })).filter((sec) => sec.fields.length > 0),
    [ctx],
  );
  const visible = useMemo(() => new Set(sections.flatMap((sec) => sec.fields.map((f) => f.key))), [sections]);
  const stateOf = (field: EditField) => combinedState(field, stored, changes, pendingKeys);
  // ?field=KEY (or the old ?step=N) opens that row's editor once the profile is loaded, unless it is hidden or locked
  const linkedKey = useMemo(() => (status === "ready" ? linkedRowKey() : null), [status]);
  const linkedField = linkedKey ? editField(linkedKey) : undefined;
  const linkedOpen =
    linkedKey === GUARDIAN_ROW_KEY
      ? GUARDIAN_ROW_KEY
      : linkedField && visible.has(linkedField.key) && !["pending", "locked"].includes(stateOf(linkedField))
        ? linkedField.key
        : null;
  const editing = opened === undefined ? linkedOpen : opened;
  // Once the deep link has been read, drop it from the address so a reload doesn't open the editor again
  useEffect(() => {
    if (linkedKey) router.replace(window.location.pathname, { scroll: false });
  }, [linkedKey, router]);
  const setEditing = setOpened;
  const activeShown = activeDealbreakers(s.dealbreakers, dealbreakerPrefsFor(shown.religion as string | null | undefined, shown), gender);

  // The bar counts rows (city + area is one), each once: review wins over «فوراً»; hidden rows (children of a
  // single member) are carried by the row that changed them
  const { fillCount, reviewCount } = useMemo(() => {
    const rows = new Map<string, "fill" | "review">();
    const add = (key: string, kind: "fill" | "review") => {
      const row = rowKeyOf(key);
      if (!visible.has(row)) return;
      if (rows.get(row) !== "review") rows.set(row, kind);
    };
    for (const k of Object.keys(plan.prefChanges ?? {})) add(k, "fill");
    for (const k of plan.fillKeys) add(k, "fill");
    for (const k of plan.reviewKeys) add(k, "review");
    let fill = [...rows.values()].filter((v) => v === "fill").length + (plan.dealbreakerKeys ? 1 : 0);
    const review = [...rows.values()].filter((v) => v === "review").length;
    if (fill + review === 0 && dirty) fill = 1;
    return { fillCount: fill, reviewCount: review };
  }, [plan, visible, dirty]);

  // Closing or reloading the tab with unsaved changes: the browser's own leave prompt
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // A link outside the page (sidebar, tab bar) with unsaved changes: ask first, as the page's own «ملفي» link does
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      const link = inAppLink(e);
      if (!link || rootRef.current?.contains(link.anchor)) return;
      e.preventDefault();
      setLeaveTo(link.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  // A save's banner sits at the top of the list: bring it into view
  useEffect(() => {
    if (!s.result) return;
    bannerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    bannerRef.current?.focus({ preventScroll: true });
  }, [s.result]);


  if (status === "failed") {
    return (
      <div className="space-y-4 py-8">
        <LoadError message="تعذّر تحميل بيانات ملفك، فلا يمكن التعديل الآن. يمكنك التحقق من الاتصال والمحاولة مرة أخرى." onRetry={s.reload} />
        <div className="text-center">
          <Button asChild variant="outline" className="h-11 rounded-xl">
            <Link href={PROFILE_PATH}>
              <ChevronRight className="me-1 h-4 w-4" aria-hidden />
              ملفي
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  if (status === "loading") return <PageLoading width="max-w-2xl" label="جارٍ تحميل بيانات الملف الشخصي…" />;

  const editingField = editing && editing !== GUARDIAN_ROW_KEY ? editField(editing) : undefined;
  const pendingLabels = [...new Set((pendingKeys ?? []).map(rowKeyOf))]
    .map((k) => editField(k)?.label(gender, country))
    .filter(Boolean)
    .join("، ");

  return (
    <div ref={rootRef} className="space-y-4 pb-8">
      <Link
        href={PROFILE_PATH}
        onClick={(e) => {
          if (!dirty) return;
          e.preventDefault();
          setLeaveTo(PROFILE_PATH);
        }}
        className="inline-flex min-h-11 items-center gap-1 text-label text-primary"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        ملفي
      </Link>
      <PageHeader
        icon={UserPen}
        title="تعديل ملفي"
        description="الحقول الفارغة تُحفظ فوراً. تغيير معلومة محفوظة يراجعه فريق نصيبك قبل ظهوره."
        className="mb-2"
      />

      {s.result && (
        <div
          ref={bannerRef}
          tabIndex={-1}
          role="status"
          className={cn(
            "outline-none",
            "flex items-start gap-3 rounded-xl p-4 text-label font-normal leading-relaxed",
            s.result.partial ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800",
          )}
        >
          {s.result.partial ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
          <span>{s.result.summary}</span>
        </div>
      )}

      {pendingKeys && (
        <div className="flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-amber-800 sm:flex-row sm:items-center">
          <Clock className="h-5 w-5 shrink-0" aria-hidden />
          <p className="flex-1 text-label font-normal leading-relaxed">
            <span className="font-bold">طلبك قيد المراجعة{pendingLabels ? `: ${pendingLabels}` : ""}.</span> يمكنك تعبئة الحقول الفارغة الآن، وتغيير
            المعلومات الأخرى بعد المراجعة.
          </p>
          <Button type="button" variant="outline" className="h-11 shrink-0 rounded-xl font-semibold" disabled={s.withdrawing} onClick={s.withdraw}>
            {s.withdrawing ? <Loader2 className="h-4 w-4 animate-spin" aria-label="جارٍ سحب الطلب" /> : "سحب الطلب"}
          </Button>
        </div>
      )}
      {s.withdrawError && (
        <p role="alert" className="text-label font-normal text-destructive">
          {s.withdrawError}
        </p>
      )}

      {sections.map((sec) => (
        <section key={sec.id} aria-labelledby={`edit-sec-${sec.id}`} className="space-y-1.5">
          <h2 id={`edit-sec-${sec.id}`} className="px-1 pt-3 text-label text-muted-ink">
            {sec.title}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {sec.fields.map((field) => {
              const state = stateOf(field);
              const label = field.label(gender, country);
              const value = valueText(field, state === "pending" ? { ...stored, ...pendingChanges } : shown, ctx);
              const old = state === "pending" ? valueText(field, stored, ctx) : null;
              const changed = state === "fill" || state === "review";
              const closed = state === "pending" || state === "locked";
              const strict = showDealbreakers && !!field.dealbreaker && activeShown.includes(field.dealbreaker);
              const inner = (
                <>
                  {changed && <span aria-hidden className="absolute inset-y-2.5 start-0 w-[3px] rounded-full bg-primary" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">{label}</span>
                    {old && <span className="block truncate text-caption text-muted-ink">الحالية: {old}</span>}
                    {strict && <span className="block text-caption font-semibold text-accent-ink">شرط أساسي</span>}
                  </span>
                  <StateTag state={state} />
                  <span className={cn("max-w-[45%] truncate text-label font-normal", value ? (closed ? "text-muted-ink" : "text-ink") : "font-semibold text-primary")}>
                    {value ?? "إضافة"}
                  </span>
                  {state === "locked" ? (
                    <Lock className="h-4 w-4 shrink-0 text-muted-ink" aria-label="مقفل حتى المراجعة" />
                  ) : state === "pending" ? null : (
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
                  )}
                </>
              );
              const rowClass = cn("relative flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start", changed && "bg-primary/5");
              return (
                <li key={field.key} data-row={field.key} data-state={state}>
                  {closed ? (
                    <div className={rowClass} aria-disabled="true">
                      {inner}
                    </div>
                  ) : (
                    <button type="button" className={cn(rowClass, "transition-colors hover:bg-muted/50")} onClick={() => setEditing(field.key)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* The guardian: never locked by a review request, saved from its own editor */}
      <section aria-labelledby="edit-sec-guardian" className="space-y-1.5">
        <h2 id="edit-sec-guardian" className="px-1 pt-3 text-label text-muted-ink">
          وليّ الأمر
        </h2>
        <ul className="overflow-hidden rounded-card border border-border bg-card">
          <li data-row={GUARDIAN_ROW_KEY} data-state="idle">
            <button
              type="button"
              className="relative flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
              onClick={() => setEditing(GUARDIAN_ROW_KEY)}
            >
              <span className="min-w-0 flex-1 text-body text-ink">بيانات وليّ الأمر</span>
              <span className={cn("max-w-[45%] truncate text-label font-normal", s.guardian?.parentName ? "text-ink" : "font-semibold text-primary")}>
                {s.guardian?.parentName
                  ? [s.guardian.parentName, GUARDIAN_RELATIONSHIPS.find((r) => r.value === s.guardian?.relationship)?.label].filter(Boolean).join(" · ")
                  : "إضافة"}
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden />
            </button>
          </li>
        </ul>
      </section>

      {dirty && <SaveBar fillCount={fillCount} reviewCount={reviewCount} saving={s.saving} onSave={(note) => void s.save(note)} onRevert={s.revert} />}

      {editingField && (
        <RowEditor
          key={editingField.key}
          field={editingField}
          ctx={ctx}
          stored={stored}
          dealbreakers={s.dealbreakers}
          showDealbreakers={showDealbreakers}
          onClose={() => setEditing(null)}
          onDone={(patch, ticked) => {
            s.setChanges(patch);
            const key = editingField.dealbreaker;
            if (key && ticked !== undefined) {
              s.setDealbreakers(ticked ? [...new Set([...s.dealbreakers, key])] : s.dealbreakers.filter((k) => k !== key));
            }
            setEditing(null);
          }}
        />
      )}

      {editing === GUARDIAN_ROW_KEY && (
        <GuardianEditor
          stored={s.guardian}
          country={country}
          introMode={introMode}
          myPhone={me?.phone}
          onSave={s.saveGuardian}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog open={leaveTo !== null} onOpenChange={(open) => !open && setLeaveTo(null)}>
        <DialogContent className="rounded-card sm:max-w-md">
          <DialogTitle className="text-headline font-bold text-ink">تجاهل التعديلات؟</DialogTitle>
          <DialogDescription className="text-body text-muted-ink">
            {forViewer(gender, "لم تُحفظ تعديلاتك بعد. إذا خرجت الآن فلن تُحفظ.", "لم تُحفظ تعديلاتكِ بعد. إذا خرجتِ الآن فلن تُحفظ.")}
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="destructive"
              className="h-12 flex-1 rounded-xl font-semibold"
              onClick={() => {
                const to = leaveTo ?? PROFILE_PATH;
                s.revert();
                setLeaveTo(null);
                router.push(to);
              }}
            >
              تجاهل
            </Button>
            <Button type="button" variant="outline" className="h-12 flex-1 rounded-xl" onClick={() => setLeaveTo(null)}>
              متابعة التعديل
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
