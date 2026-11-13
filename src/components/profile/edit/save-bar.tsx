"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arabicCount } from "@/lib/utils";

const NOTE_MAX = 1000;

/** «تعديلان», «3 تعديلات» */
export const editsCount = (n: number) => arabicCount(n, { one: "تعديل واحد", two: "تعديلان", few: "تعديلات", many: "تعديلاً" });

/**
 * The sticky save bar of the edit list, shown once something changed: «{n} تعديلات» with what saves at once and what
 * goes to review, «حفظ», and «تراجع» from `md:` up. With review rows, an optional note to the review team opens
 * behind a link.
 */
export function SaveBar({
  fillCount,
  reviewCount,
  saving,
  onSave,
  onRevert,
}: {
  fillCount: number;
  reviewCount: number;
  saving: boolean;
  onSave: (note?: string) => void;
  onRevert: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const split = [fillCount > 0 && `${fillCount} فوراً`, reviewCount > 0 && `${reviewCount} للمراجعة`].filter(Boolean).join(" · ");

  return (
    <div
      role="region"
      aria-label="شريط الحفظ"
      className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mt-6 space-y-3 border-t border-border bg-background/95 py-3 backdrop-blur md:bottom-0"
    >
      {reviewCount > 0 && (
        <div>
          {noteOpen ? (
            <div className="space-y-1">
              <label htmlFor="edit-review-note" className="text-label text-ink">
                ملاحظة لفريق المراجعة (اختياري)
              </label>
              <textarea
                id="edit-review-note"
                rows={2}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="min-h-11 text-label text-primary underline-offset-4 hover:underline">
              ملاحظة لفريق المراجعة (اختياري)
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-label text-ink">{editsCount(fillCount + reviewCount)}</p>
          {split && <p className="text-caption text-muted-ink">{split}</p>}
        </div>
        <Button type="button" variant="outline" className="hidden h-12 rounded-xl md:inline-flex" onClick={onRevert} disabled={saving}>
          تراجع
        </Button>
        <Button type="button" className="h-12 w-32 rounded-xl font-semibold" onClick={() => onSave(note)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="جارٍ الحفظ" /> : "حفظ"}
        </Button>
      </div>
    </div>
  );
}
