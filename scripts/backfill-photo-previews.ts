/**
 * One-off backfill of the blurred photo previews (Photo.blurPreview) for photos uploaded before the feature.
 * Loops fillPhotoPreviews in batches until no photo without a preview is left. One attempt per photo per run: a photo
 * that fails (HEIC/odd/huge, missing file) is logged by id and left null. Prints counts only, never URLs.
 *
 *   cd /var/www/naseebak && set -a && . ./.env && set +a && pnpm exec tsx scripts/backfill-photo-previews.ts
 *
 * Safe to run again (only null previews are touched) and never touches User.updatedAt. The morning job also fills
 * up to 200 a day, so this is only needed to catch up at once after the schema push.
 */
import { backfillAllPreviews } from "../src/lib/cron/photo-previews";
import { db } from "../src/lib/db";

async function main() {
  const { filled, failed } = await backfillAllPreviews(200, (r) => console.log(`batch: filled ${r.filled}, failed ${r.failed}`));
  console.log(`done: filled ${filled}, failed ${failed}`);
}

main()
  .catch((err) => {
    console.error("backfill failed:", String((err as Error)?.message ?? err).split(":")[0]);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
