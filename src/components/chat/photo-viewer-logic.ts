/** The photo viewer's rules (plain functions): swipe between the chat's photos, and the zoom range */

/** A swipe shorter than this stays on the same photo */
export const SWIPE_PX = 60;
export const MAX_ZOOM = 4;

/**
 * The photo after a horizontal swipe of `dx` px. Photos run oldest → newest in reading order, so in RTL the newer one
 * sits to the left: a finger moving right brings it in. LTR is the mirror. Stops at both ends.
 */
export function photoSwipe({ index, count, dx, rtl }: { index: number; count: number; dx: number; rtl: boolean }): number {
  if (Math.abs(dx) < SWIPE_PX) return index;
  const towardNewer = rtl ? dx > 0 : dx < 0;
  return Math.min(count - 1, Math.max(0, index + (towardNewer ? 1 : -1)));
}

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, scale));
}

/**
 * The pan of a zoomed photo, kept on the photo: the transform is `scale(s) translate(x, y)`, so a pan moves the photo
 * by `x × s` on screen, and at most `(s − 1) / 2` of the stage is off screen each way.
 */
export function clampPan(
  offset: { x: number; y: number },
  scale: number,
  stage: { width: number; height: number }
): { x: number; y: number } {
  if (scale <= 1) return { x: 0, y: 0 };
  const maxX = ((scale - 1) / 2) * (stage.width / scale);
  const maxY = ((scale - 1) / 2) * (stage.height / scale);
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v));
  return { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) };
}
