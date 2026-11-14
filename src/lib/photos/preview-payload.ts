/**
 * `photoPreview` on pre-match payloads about another member (spec
 * docs/superpowers/specs/2026-11-14-blurred-photo-preview-design.md): the 16 px blurred copy of their main photo, or
 * null. The only photo data a client gets before a match: never a url, path or larger copy. Never added to match,
 * chat, admin or my-own-profile payloads (guard: src/__tests__/photos/preview-guard.test.ts).
 *
 * Server-only (reads settings, which imports the db).
 */
import { getPhotoBlurPreview } from "@/lib/settings";
import { BLUR_PREVIEW_MAX_BYTES, primaryPhotoPreview } from "@/lib/photos/blur-preview";

/** Spread into the person's Prisma `select` so the card query loads the preview with the card (no extra round trip) */
export const previewSelect = {
  photos: { select: { isPrimary: true, order: true, blurPreview: true } },
} as const;

export type PreviewPhotos = readonly { isPrimary: boolean; order: number; blurPreview: string | null }[] | null | undefined;

const PREVIEW_PREFIX = "data:image/webp;base64,";

/** The card with `photoPreview` added: the main photo's preview when enabled, else null. Never anything but a small WebP data URI */
export function withPhotoPreview<T extends object>(card: T, photos: PreviewPhotos, enabled: boolean): T & { photoPreview: string | null } {
  const preview = enabled && photos ? primaryPhotoPreview(photos) : null;
  const safe = preview && preview.startsWith(PREVIEW_PREFIX) && preview.length <= BLUR_PREVIEW_MAX_BYTES ? preview : null;
  return { ...card, photoPreview: safe };
}

/** Setting `photo_blur_preview`, default on; a failed read keeps the default */
export async function photoPreviewEnabled(): Promise<boolean> {
  try {
    return await getPhotoBlurPreview();
  } catch {
    return true;
  }
}
