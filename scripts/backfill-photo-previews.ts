/**
 * One-off backfill of the blurred photo previews (Photo.blurPreview) for photos uploaded before the feature.
 * Loops fillPhotoPreviews in batches until no photo without a preview is left. One attempt per photo per run: a photo
 * that fails (HEIC/odd/huge, missing file) is logged by id and left null. Prints counts only, never URLs.
 *
 *   cd /var/www/naseebak && set -a && . ./.env && set +a && npx tsx scripts/backfill-photo-previews.ts
 *
 * Safe to run again (only null previews are touched) and never touches User.updatedAt. The morning job also fills
 * up to 200 a day, so this is only needed to catch up at once after the schema push.
 */
import { fillPhotoPreviews } from "../src/lib/cron/photo-previews";
import { db } from "../src/lib/db";

const BATCH = 200;

async function main() {
  let filled = 0;
  let failed = 0;
  let after: string | undefined;
  for (;;) {
    const r = await fillPhotoPreviews({ limit: BATCH, after });
    filled += r.filled;
    failed += r.failed;
    console.log(`batch: filled ${r.filled}, failed ${r.failed}`);
    // Stop when nothing is left to look at (the cursor moves past failed rows, so this always ends)
    if (!r.lastId || r.filled + r.failed < BATCH) break;
    after = r.lastId;
  }
  console.log(`done: filled ${filled}, failed ${failed}`);
}

main()
  .catch((err) => {
    console.error("backfill failed:", String((err as Error)?.message ?? err).split(":")[0]);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
