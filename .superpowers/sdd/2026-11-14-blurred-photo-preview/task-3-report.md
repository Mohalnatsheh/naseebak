# Task 3 report
- `src/lib/cron/photo-previews.ts`: `fillPhotoPreviews({limit=200, after?})` -> `{filled, failed, lastId}`; null previews only, id order (cuid = oldest first), one attempt per row, failures logged by photo id (message only, no URL). Writes only `blurPreview`.
- Morning task `blurPreviews` registered in `runDailyJobs()` (daily.ts); daily.test mocks it.
- `scripts/backfill-photo-previews.ts`: loops with an id cursor (failed rows are passed, so it always ends); prints counts. Run: `set -a; . ./.env; set +a; npx tsx scripts/backfill-photo-previews.ts` (tsx via npx, needed for the `@/` alias).
- Guard test narrowed (`withPhotoPreview|previewSelect|photoPreview`), client components/(ar) pages excluded, `feed-types.ts` allowed.
- Task key named `blurPreviews` because the guard matches `photoPreview` text.
Concern: rows that can never process (>200 of them) would crowd the morning batch since failures stay null; script handles it by cursor.
