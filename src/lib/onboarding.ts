/**
 * Pure helpers for the dashboard onboarding guide (no db import: safe in client components).
 */

export const ONBOARDING_STORAGE_KEY = "naseeb_onboarding_completed";

/** Members whose setup is done and whose account is older than this have used the site already */
export const ONBOARDING_RETURNING_DAYS = 7;

/** localStorage can throw (Safari with storage blocked, some private modes): never let that break the page */
export function readOnboardingDone(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return !!storage?.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Storage unavailable: treat as seen rather than showing the guide on every page load
    return true;
  }
}

export function writeOnboardingDone(storage: Pick<Storage, "setItem"> | undefined): void {
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch {
    // ignore
  }
}

/**
 * Whether to open the guide: only once the profile and the switches have loaded (the steps depend on
 * both), not after it was finished on this browser, and not for a returning member on a new device.
 */
export function shouldShowOnboarding({
  loading,
  completed,
  setupDone,
  createdAt,
  now = Date.now(),
}: {
  loading: boolean;
  completed: boolean;
  setupDone: boolean;
  createdAt?: string | null;
  now?: number;
}): boolean {
  if (loading || completed) return false;
  if (setupDone && createdAt) {
    const age = now - new Date(createdAt).getTime();
    if (Number.isFinite(age) && age > ONBOARDING_RETURNING_DAYS * 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

/** Keep the current step inside the list when the list shrinks (e.g. the switches changed it). */
export function clampStep(step: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, step), length - 1);
}
