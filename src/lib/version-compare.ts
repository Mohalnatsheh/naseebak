/** «1.2.3» versions, db-free so the admin page can check them as typed (the server checks again, ADM-25) */
export const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** -1 / 0 / 1 for two «1.2.3» versions, part by part as numbers (1.10.0 > 1.9.0) */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  return 0;
}

/** The problem with a platform's required / latest pair, or null */
export function versionPairError(min: string, latest: string): string | null {
  const a = min.trim();
  const b = latest.trim();
  if (VERSION_PATTERN.test(a) && VERSION_PATTERN.test(b) && compareVersions(a, b) > 0) {
    return `the required version (${a}) can't be above the latest version (${b})`;
  }
  return null;
}
