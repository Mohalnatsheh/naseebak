/**
 * Fills the blurred preview of photos that have none (blurred-photo-preview spec): uploads made before the feature,
 * and any photo whose preview failed earlier. Oldest first, one attempt per row per run, a failure is logged by
 * photo id (never the URL) and skipped. Writes `Photo.blurPreview` only, so `User.updatedAt` is untouched.
 * Idempotent: rows with a preview are never selected. Run by the morning job; scripts/backfill-photo-previews.ts
 * loops it for the first big backfill.
 */
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { makeBlurPreview, readPhotoBytes } from "@/lib/photos/blur-preview";

/** Stop starting new rows after this long, so the morning job is never held up by slow storage */
export const PREVIEW_DEADLINE_MS = 90_000;
/** One photo read gives up after this long */
export const PREVIEW_READ_TIMEOUT_MS = 15_000;
export const PREVIEW_CURSOR_KEY = "photo_preview_cursor";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("read timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function fillPhotoPreviews({ limit = 200, after }: { limit?: number; after?: string } = {}): Promise<{
  filled: number;
  failed: number;
  /** The last photo id looked at, to continue after it (a row that failed stays null and would be picked again) */
  lastId?: string;
  /** How many rows the query returned (fewer than the limit = the sweep reached the end) */
  rows: number;
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
  const deadline = Date.now() + PREVIEW_DEADLINE_MS;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
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
  return { filled, failed, lastId, rows: rows.length };
}

/**
 * The morning task: continues after the stored cursor so photos that keep failing don't take the same slots every day.
 * The cursor resets when a run reaches the end (fewer rows than the limit), so failures are retried once per full
 * sweep and new null photos are always reached.
 */
export async function runPhotoPreviewSweep(limit = 200): Promise<{ filled: number; failed: number }> {
  const cursor = (await getSetting(PREVIEW_CURSOR_KEY)) || undefined;
  const r = await fillPhotoPreviews({ limit, after: cursor });
  const next = r.rows < limit ? "" : (r.lastId ?? cursor ?? "");
  await setSetting(PREVIEW_CURSOR_KEY, next);
  return { filled: r.filled, failed: r.failed };
}
