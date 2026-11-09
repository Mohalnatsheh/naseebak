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
