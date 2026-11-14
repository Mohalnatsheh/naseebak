# Task 3 report
- `src/lib/cron/photo-previews.ts`: `fillPhotoPreviews({limit=200, after?})` -> `{filled, failed, lastId}`; null previews only, id order (cuid = oldest first), one attempt per row, failures logged by photo id (message only, no URL). Writes only `blurPreview`.
- Morning task `blurPreviews` registered in `runDailyJobs()` (daily.ts); daily.test mocks it.
- `scripts/backfill-photo-previews.ts`: loops with an id cursor (failed rows are passed, so it always ends); prints counts. Run: `set -a; . ./.env; set +a; npx tsx scripts/backfill-photo-previews.ts` (tsx via npx, needed for the `@/` alias).
- Guard test narrowed (`withPhotoPreview|previewSelect|photoPreview`), client components/(ar) pages excluded, `feed-types.ts` allowed.
- Task key named `blurPreviews` because the guard matches `photoPreview` text.
Concern: rows that can never process (>200 of them) would crowd the morning batch since failures stay null; script handles it by cursor.

## Fix round 1
1. `runPhotoPreviewSweep` keeps a cursor in `system_settings` (`photo_preview_cursor`); resets to empty when a run returns fewer rows than the limit. Morning task now calls it.
2. `fillPhotoPreviews`: 90 s deadline (no new rows started) and 15 s race per read; `lastId` is the last row tried, so the cursor never skips unprocessed rows. Fake-timer tests for both.
3. Guard regex restored (`primaryPhotoPreview|blurPreview` back); `lib/cron/photo-previews.ts` allowed; client files recognised by `"use client"` in the first lines. Task key renamed `previewFill` (the name `blurPreviews` matched `blurPreview`).
4. daily test: morning runs `previewFill` and isolates its failure.
5. Local backfill against naseeb_push (13 photos): filled 1, failed 12 (seed rows whose files are not in `.dev-uploads`); preview 139 chars. Re-run is idempotent.
