/**
 * Fills the blurred preview of photos that have none (blurred-photo-preview spec): uploads made before the feature,
 * and any photo whose preview failed earlier. Oldest first, one attempt per row per run, a failure is logged by
 * photo id (never the URL) and skipped. Writes `Photo.blurPreview` only, so `User.updatedAt` is untouched.
 * Idempotent: rows with a preview are never selected. Run by the morning job; scripts/backfill-photo-previews.ts
 * loops it for the first big backfill.
 */
import { db } from "@/lib/db";
import { makeBlurPreview, readPhotoBytes } from "@/lib/photos/blur-preview";

export async function fillPhotoPreviews({ limit = 200, after }: { limit?: number; after?: string } = {}): Promise<{
  filled: number;
  failed: number;
  /** The last photo id looked at, to continue after it (a row that failed stays null and would be picked again) */
  lastId?: string;
}> {
  const rows = await db.photo.findMany({
    where: { blurPreview: null, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" }, // cuids sort by creation time: oldest first
    take: limit,
    select: { id: true, url: true },
  });
  let filled = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const bytes = await readPhotoBytes(row.url);
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
  return { filled, failed, lastId: rows.length ? rows[rows.length - 1].id : undefined };
}
