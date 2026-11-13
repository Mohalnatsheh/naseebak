"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DealbreakerToggle } from "@/components/profile/form-fields";
import type { EditField, EditShowCtx } from "@/lib/profile-edit-fields";
import { isEmptyStored } from "@/lib/profile-edit-split";
import { dealbreakerPrefsFor } from "@/lib/profile-religion";
import { activeDealbreakers } from "@/lib/matching/dealbreaker-summary";
import { forViewer } from "@/lib/gendered-copy";
import { FieldControl, checkDraft, initialDraft, isOtherJob, rowKeys, toPatch, type Values } from "./field-control";

export { rowKeys } from "./field-control";

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** `md:` and up: the editor is a dialog; below, a bottom sheet */
function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Whether a change to this row goes to review: a stored answer (a `storedDefault` always holds one), never a preference */
export function needsReview(field: EditField, stored: Values): boolean {
  if (field.key.startsWith("pref")) return false;
  return field.storedDefault !== undefined || rowKeys(field).some((k) => !isEmptyStored(stored[k]));
}

export interface RowEditorProps {
  field: EditField;
  /** gender, country, religion switch and the values shown (stored + unsaved changes) */
  ctx: EditShowCtx;
  stored: Values;
  /** The «شرط أساسي» keys ticked now (shown when `showDealbreakers`) */
  dealbreakers: string[];
  showDealbreakers: boolean;
  onClose: () => void;
  /** «تم»: the row's new values and, for a preference with a «شرط أساسي», whether it is ticked */
  onDone: (patch: Values, dealbreakerTicked?: boolean) => void;
}

/**
 * One row's editor: a dialog on `md:` and up, a bottom sheet on phones. «تم» changes nothing on the server: it
 * hands the row's values back to the list, which marks the row. Errors show under the control.
 */
export function RowEditor({ field, ctx, stored, dealbreakers, showDealbreakers, onClose, onDone }: RowEditorProps) {
  const { gender, country } = ctx;
  const label = field.label(gender, country);
  const id = `edit-${field.key}`;
  const [draft, setDraft] = useState<Values>(() => initialDraft(field, ctx.profile));
  const [jobOther, setJobOther] = useState(() => isOtherJob(field, ctx.profile, ctx));
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState(() => !!field.dealbreaker && dealbreakers.includes(field.dealbreaker));
  const set = (patch: Values) => {
    setError("");
    setDraft((d) => ({ ...d, ...patch }));
  };
  const profile = { ...ctx.profile, ...toPatch(field, draft) };
  const religion = profile.religion as string | null | undefined;
  const hints = field.hints?.({ ...ctx, profile, dealbreakers: activeDealbreakers(dealbreakers, dealbreakerPrefsFor(religion, profile), gender) }) ?? [];
  const dealbreakerKey = showDealbreakers ? field.dealbreaker : undefined;
  const dealbreakerOff = !dealbreakerKey || activeDealbreakers([dealbreakerKey], dealbreakerPrefsFor(religion, profile), gender).length === 0;

  function done() {
    const issue = checkDraft(field, draft, label, jobOther, country);
    if (issue) {
      setError(issue);
      return;
    }
    onDone(toPatch(field, draft), dealbreakerKey ? ticked && !dealbreakerOff : undefined);
  }

  const invalid = !!error;

  const control = <FieldControl id={id} field={field} ctx={ctx} value={draft} onChange={set} invalid={invalid} jobOther={jobOther} onJobOther={setJobOther} />;

  const body = (
    <div className="space-y-4">
      {needsReview(field, stored) && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-label font-normal leading-relaxed text-amber-800">
          <Clock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          تغيير {label} يُرسل لفريق نصيبك للمراجعة قبل ظهوره.
        </p>
      )}
      <p id={`${id}-label`} className="sr-only">{label}</p>
      {control}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      )}
      {hints.map((h) => (
        <p key={h} className="text-label font-normal leading-relaxed text-muted-ink">{h}</p>
      ))}
      {dealbreakerKey && (
        <div className="flex flex-wrap items-center gap-2">
          <DealbreakerToggle id={id} checked={ticked} disabled={dealbreakerOff} onChange={setTicked} />
          <span className="text-caption text-muted-ink">{forViewer(gender, "لن نقترح عليك من لا يحققه.", "لن نقترح عليكِ من لا يحققه.")}</span>
        </div>
      )}
    </div>
  );
  const actions = (
    <>
      <Button type="button" className="h-12 flex-1 rounded-xl font-semibold" onClick={done}>
        تم
      </Button>
      <Button type="button" variant="outline" className="h-12 w-28 rounded-xl" onClick={onClose}>
        إلغاء
      </Button>
    </>
  );

  return (
    <EditorShell title={label} onClose={onClose} actions={actions}>
      {body}
    </EditorShell>
  );
}

/** The editor's frame: a dialog on `md:` and up, a bottom sheet on phones. Closing (✕, outside, Esc) calls `onClose` */
export function EditorShell({ title, onClose, actions, children }: { title: string; onClose: () => void; actions: ReactNode; children: ReactNode }) {
  const desktop = useDesktop();
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  // The body scrolls; the title and the actions row stay in view however tall the editor is (the guardian's is)
  const actionsRow = <div className="flex shrink-0 gap-3 border-t border-border pt-3">{actions}</div>;
  if (desktop) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="flex max-h-[85dvh] flex-col overflow-hidden rounded-card sm:max-w-lg">
          <DialogTitle className="shrink-0 text-headline font-bold text-ink">{title}</DialogTitle>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1">{children}</div>
          {actionsRow}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[90dvh] overflow-hidden rounded-t-sheet px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <SheetTitle className="shrink-0 text-headline font-bold text-ink">{title}</SheetTitle>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-1">{children}</div>
        {actionsRow}
      </SheetContent>
    </Sheet>
  );
}
