/**
 * The blurred photo preview shown on a locked avatar before a match (spec
 * docs/superpowers/specs/2026-11-14-blurred-photo-preview-design.md).
 *
 * Each photo row keeps `blurPreview`: a `data:image/webp;base64,…` of the photo, strongly blurred first, then shrunk
 * to 16 px on its longest side, metadata stripped. Only soft colour survives, never a recognisable image. Making one
 * never throws: a photo it can't be made from keeps null and the member keeps the initial.
 */
import { db as prisma } from "@/lib/db";
import { base64ToBuffer, getBunnyPathFromUrl, readFromBunny } from "@/lib/bunny";

/** A larger data URI is discarded (null) */
export const BLUR_PREVIEW_MAX_BYTES = 1024;
/** Longest side of the stored preview */
const PREVIEW_SIDE = 16;
/** The blur runs on a copy this size (cheap on a 12 MP photo, and sigma 20 here is very strong) */
const BLUR_WORK_SIDE = 256;
const BLUR_SIGMA = 20;
/** Pixels sharp may decode: a 48 MP phone photo fits, a decompression bomb doesn't */
const MAX_INPUT_PIXELS = 100_000_000;
/** A photo fetched by its URL (an older row outside Bunny): time and size caps */
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_BYTES = 15 * 1024 * 1024;
const DATA_URI_PREFIX = "data:image/webp;base64,";

/** The 16 px blurred WebP data URI of a photo, or null (undecodable, or over 1 KB) */
export async function makeBlurPreview(input: Buffer): Promise<string | null> {
  try {
    if (!input || input.length === 0) return null;
    // Loaded here so this module stays importable without the native module
    const { default: sharp } = await import("sharp");
    // 1. Upright, shrunk to a work copy, strongly blurred (sharp applies blur after resize within one pipeline,
    //    so the blur gets its own pass before the final shrink)
    const blurred = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(BLUR_WORK_SIDE, BLUR_WORK_SIDE, { fit: "inside", withoutEnlargement: true })
      .blur(BLUR_SIGMA)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // 2. Down to 16 px on the longest side, WebP at low quality. No withMetadata(): EXIF, ICC and XMP are dropped
    const { width, height, channels } = blurred.info;
    const out = await sharp(blurred.data, { raw: { width, height, channels } })
      .resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: "inside" })
      .webp({ quality: 40 })
      .toBuffer();
    const uri = DATA_URI_PREFIX + out.toString("base64");
    return uri.length <= BLUR_PREVIEW_MAX_BYTES ? uri : null;
  } catch {
    return null;
  }
}

/** The member's preview: the primary photo's, else the lowest order's, else null */
export function primaryPhotoPreview(
  photos: readonly { isPrimary: boolean; order: number; blurPreview: string | null }[],
): string | null {
  if (photos.length === 0) return null;
  const source = photos.find((p) => p.isPrimary) ?? [...photos].sort((a, b) => a.order - b.order)[0];
  return source.blurPreview ?? null;
}

async function fetchCapped(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length <= FETCH_MAX_BYTES ? buf : null;
}

/** The stored bytes of a photo: from Bunny (or `.dev-uploads/` locally), a legacy inline data URL, or its URL */
export async function readPhotoBytes(url: string): Promise<Buffer | null> {
  const path = getBunnyPathFromUrl(url);
  if (path) return readFromBunny(path);
  if (url.startsWith("data:")) return base64ToBuffer(url)?.buffer ?? null;
  if (/^https:\/\//.test(url)) return fetchCapped(url);
  return null;
}

type PhotoDb = Pick<typeof prisma, "photo">;

/**
 * Make sure every photo of the member has its preview: computes the missing ones from the photo bytes, leaves
 * rows that have one. Never throws (logged); a photo that fails stays null.
 */
export async function refreshMemberPreviews(userId: string, db: PhotoDb = prisma): Promise<void> {
  try {
    const rows = await db.photo.findMany({
      where: { userId },
      select: { id: true, url: true, blurPreview: true },
    });
    for (const row of rows) {
      if (row.blurPreview) continue;
      try {
        const bytes = await readPhotoBytes(row.url);
        const preview = bytes ? await makeBlurPreview(bytes) : null;
        if (preview) await db.photo.update({ where: { id: row.id }, data: { blurPreview: preview } });
      } catch (err) {
        // The message only: a fetch error's cause may carry the url
        console.warn(`[blur-preview] photo ${row.id}:`, String((err as Error)?.message ?? err).split(":")[0]);
      }
    }
  } catch (err) {
    console.warn(`[blur-preview] member ${userId}:`, String((err as Error)?.message ?? err).split(":")[0]);
  }
}
