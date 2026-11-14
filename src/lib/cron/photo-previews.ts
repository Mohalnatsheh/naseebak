/**
 * Fills the blurred preview of photos that have none (blurred-photo-preview spec): uploads made before the feature,
 * and any photo whose preview failed earlier. Oldest first, one attempt per row per run, a failure is logged by
 * photo id (never the URL) and skipped. Writes `Photo.blurPreview` only, so `User.updatedAt` is untouched.
 * Idempotent: rows with a preview are never selected. Run by the morning job; scripts/backfill-photo-previews.ts
 * loops it for the first big backfill.
 */
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { makeBlurPreview, readPhotoBytes, withTimeout, PHOTO_READ_TIMEOUT_MS } from "@/lib/photos/blur-preview";

/** Stop starting new rows after this long, so the morning job is never held up by slow storage */
export const PREVIEW_DEADLINE_MS = 90_000;
export const PREVIEW_READ_TIMEOUT_MS = PHOTO_READ_TIMEOUT_MS;
export const PREVIEW_CURSOR_KEY = "photo_preview_cursor";

export async function fillPhotoPreviews({ limit = 200, after, deadlineMs = PREVIEW_DEADLINE_MS }: { limit?: number; after?: string; deadlineMs?: number | null } = {}): Promise<{
  filled: number;
  failed: number;
  /** The last photo id looked at, to continue after it (a row that failed stays null and would be picked again) */
  lastId?: string;
  /** How many rows the query returned (fewer than the limit = the sweep reached the end) */
  rows: number;
  /** True when the deadline cut the run short */
  cut: boolean;
}> {
  const rows = await db.photo.findMany({
    where: { blurPreview: null, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" }, // cuids sort by creation time: oldest first
    take: limit,
    select: { id: true, url: true },
  });
  let filled = 0;
  let failed = 0;
  let lastId: string | undefined;
  const deadline = deadlineMs === null ? Infinity : Date.now() + deadlineMs;
  let cut = false;
  for (const row of rows) {
    if (Date.now() >= deadline) {
      cut = true;
      break;
    }
    lastId = row.id;
    try {
      const bytes = await withTimeout(readPhotoBytes(row.url), PREVIEW_READ_TIMEOUT_MS);
      const preview = bytes ? await makeBlurPreview(bytes) : null;
      if (!preview) throw new Error("no preview");
      await db.photo.update({ where: { id: row.id }, data: { blurPreview: preview } });
      filled++;
    } catch (err) {
      failed++;
      // The message only: a fetch error's cause may carry the url
      console.warn(`[photo-previews] photo ${row.id}:`, String((err as Error)?.message ?? err).split(":")[0]);
    }
  }
  return { filled, failed, lastId, rows: rows.length, cut };
}

/**
 * The morning task: continues after the stored cursor so photos that keep failing don't take the same slots every day.
 * The cursor resets when a run reaches the end (fewer rows than the limit), so failures are retried once per full
 * sweep and new null photos are always reached.
 */
export async function runPhotoPreviewSweep(limit = 200): Promise<{ filled: number; failed: number }> {
  const cursor = (await getSetting(PREVIEW_CURSOR_KEY)) || undefined;
  const r = await fillPhotoPreviews({ limit, after: cursor });
  // Reset only when every returned row was tried and the sweep reached the end; a deadline cut keeps the cursor
  const next = r.rows < limit && !r.cut ? "" : (r.lastId ?? cursor ?? "");
  await setSetting(PREVIEW_CURSOR_KEY, next);
  return { filled: r.filled, failed: r.failed };
}

/**
 * The backfill script's loop: every batch without a deadline, continuing after the last row tried (failed rows are
 * passed, so it always ends), until a batch comes back shorter than `batch`.
 */
export async function backfillAllPreviews(
  batch = 200,
  onBatch?: (r: { filled: number; failed: number }) => void,
): Promise<{ filled: number; failed: number }> {
  let filled = 0;
  let failed = 0;
  let after: string | undefined;
  for (;;) {
    const r = await fillPhotoPreviews({ limit: batch, after, deadlineMs: null });
    filled += r.filled;
    failed += r.failed;
    onBatch?.(r);
    if (!r.lastId || r.rows < batch) break;
    after = r.lastId;
  }
  return { filled, failed };
}
