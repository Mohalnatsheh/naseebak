"use client";

import { useEffect, useMemo } from "react";

// S2, the photo reveal: blurred to sharp once per photo and browser session, not on every visit (review X4b minor 2)
const KEY = "nsb-revealed-photos";
const KEEP = 200;

function seenPhotos(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

function markSeen(url: string) {
  try {
    const list = seenPhotos().filter((u) => u !== url);
    list.push(url);
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    // Storage blocked: the reveal just plays again next time
  }
}

/** True while this photo shows for the first time this session (and `enabled`); it is remembered once shown */
export function useFirstReveal(url: string | null | undefined, enabled: boolean): boolean {
  const first = useMemo(
    () => enabled && !!url && typeof window !== "undefined" && !seenPhotos().includes(url),
    [enabled, url]
  );
  useEffect(() => {
    if (enabled && url) markSeen(url);
  }, [enabled, url]);
  return first;
}
