"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/shared/load-error";
import { DealbreakerToggle, Field } from "@/components/profile/form-fields";
import { FieldControl, checkDraft, initialDraft, toPatch, type Values } from "@/components/profile/edit/field-control";
import { useEditSession } from "@/components/profile/edit/use-edit-session";
import { EDIT_SECTIONS, type EditField, type EditShowCtx } from "@/lib/profile-edit-fields";
import { dealbreakerPrefsFor } from "@/lib/profile-religion";
import { activeDealbreakers } from "@/lib/matching/dealbreaker-summary";
import { useDashboardData } from "@/contexts/dashboard-context";

const PREF_FIELDS: EditField[] = EDIT_SECTIONS.filter((s) => s.id === "prefs").flatMap((s) => s.fields);

/**
 * «تفضيلات الشريك» as in the app: every partner preference on one page, its value and its «شرط أساسي» together, one
 * «حفظ التفضيلات». Preferences and conditions save at once (never reviewed), through the edit page's save
 * (`useEditSession` → `runSave`: the preferences, then the conditions). `onSaved`: everything saved.
 */
export function PartnerPrefsEditor({
  onSaved,
  renderFrame,
}: {
  onSaved: () => void;
  /** Places the body (scrolls) and the actions (stay at the bottom) in the window or the sheet */
  renderFrame: (body: ReactNode, actions: ReactNode) => ReactNode;
}) {
  const { counts } = useDashboardData();
  const religionEnabled = counts?.religionEnabled === true;
  const s = useEditSession({ religionEnabled, showDealbreakers: true });
  const { status, gender, country, shown } = s;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedOnce, setSavedOnce] = useState(false);

  const ctx: EditShowCtx = useMemo(() => ({ gender, country, religionEnabled, profile: shown }), [gender, country, religionEnabled, shown]);
  const fields = PREF_FIELDS.filter((f) => !f.showIf || f.showIf(ctx));
  const religion = shown.religion as string | null | undefined;
  const active = activeDealbreakers(s.dealbreakers, dealbreakerPrefsFor(religion, shown), gender);

  // A full save closes the window; a partial one stays open with its line
  useEffect(() => {
    if (savedOnce && s.result && !s.result.partial) onSaved();
  }, [savedOnce, s.result, onSaved]);

  async function save() {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const issue = checkDraft(field, initialDraft(field, shown), field.label(gender, country), false, country);
      if (issue) next[field.key] = issue;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      document.querySelector(`[data-field="pref-${Object.keys(next)[0]}"]`)?.scrollIntoView?.({ block: "center" });
      return;
    }
    if (!s.dirty) {
      onSaved();
      return;
    }
    setSavedOnce(true);
    await s.save();
  }

  if (status === "failed") return renderFrame(<LoadError onRetry={s.reload} />, null);
  if (status === "loading") {
    return renderFrame(
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>,
      null,
    );
  }

  const body = (
    <div className="space-y-5">
      {fields.map((field) => {
        const id = `pref-${field.key}`;
        const value = initialDraft(field, shown);
        const key = field.dealbreaker;
        const filled = !!key && activeDealbreakers([key], dealbreakerPrefsFor(religion, shown), gender).length > 0;
        const hints = field.hints?.({ ...ctx, dealbreakers: active }) ?? [];
        return (
          <Field
            key={field.key}
            id={id}
            label={field.label(gender, country)}
            optional={!field.required}
            error={errors[field.key]}
            aside={
              key && (
                <DealbreakerToggle
                  id={id}
                  checked={filled && s.dealbreakers.includes(key)}
                  disabled={!filled}
                  onChange={(on) => s.setDealbreakers(on ? [...new Set([...s.dealbreakers, key])] : s.dealbreakers.filter((k) => k !== key))}
                />
              )
            }
          >
            <FieldControl
              id={id}
              field={field}
              ctx={ctx}
              value={value}
              invalid={!!errors[field.key]}
              onChange={(patch: Values) => {
                setErrors((e) => {
                  if (!e[field.key]) return e;
                  const rest = { ...e };
                  delete rest[field.key];
                  return rest;
                });
                s.setChanges(toPatch(field, { ...value, ...patch }));
              }}
            />
            {hints.map((line) => (
              <p key={line} className="px-1 text-caption text-muted-ink">
                {line}
              </p>
            ))}
          </Field>
        );
      })}
    </div>
  );

  const actions = (
    <div className="w-full space-y-2">
      {s.result?.partial && (
        <p role="alert" className="text-label font-normal text-destructive">
          {s.result.summary}
        </p>
      )}
      <Button type="button" onClick={save} disabled={s.saving} className="h-12 w-full rounded-xl text-base font-bold">
        {s.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "حفظ التفضيلات"}
      </Button>
    </div>
  );

  return renderFrame(body, actions);
}
